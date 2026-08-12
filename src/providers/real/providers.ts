import type { Coordinate, PlaceSearchResult, RouteId, StopId, TransitPoint, TransitRoute, TransitTrip } from '../../domain/models'
import type { TransitNetwork } from '../../routing/network'
import { ProviderUnavailableError, type ProviderId } from '../availability'
import type {
  ArrivalEstimate,
  BusProvider,
  PlaceProvider,
  SubwayProvider,
  TransitNetworkProvider,
  TransitProviderSet,
  VehiclePosition,
  WalkingProvider,
  WalkingRoute,
} from '../interfaces'

interface BackendErrorBody { error?: { code?: string; message?: string; provider?: string } }

export class BackendApiClient {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}, providerId: ProviderId = 'transit-network'): Promise<T> {
    if (!this.baseUrl) throw new ProviderUnavailableError(providerId)
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}${path}`, window.location.origin)
    Object.entries(params).forEach(([name, value]) => { if (value !== undefined) url.searchParams.set(name, String(value)) })
    let response: Response | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 12_000)
      try {
        response = await this.fetcher(url.toString(), { headers: { accept: 'application/json' }, signal: controller.signal })
        if (response.status < 500 || attempt === 1) break
      } catch {
        if (attempt === 1) throw new ProviderUnavailableError(providerId)
      } finally {
        window.clearTimeout(timeout)
      }
    }
    if (!response) throw new ProviderUnavailableError(providerId)
    const body = await response.json().catch(() => undefined) as T | BackendErrorBody | undefined
    if (!response.ok || body === undefined) {
      const backendError = body as BackendErrorBody | undefined
      const error = new Error(backendError?.error?.message ?? `Backend unavailable (${response.status})`)
      error.name = backendError?.error?.code ?? 'PROVIDER_UNAVAILABLE'
      throw error
    }
    return body as T
  }
}

export class KakaoLocalPlaceProvider implements PlaceProvider {
  constructor(private readonly client: BackendApiClient) {}
  search(query: string): Promise<PlaceSearchResult[]> { return query ? this.client.get('/places/search', { q: query }, 'kakao-local') : Promise.resolve([]) }
  reverseGeocode(coordinate: Coordinate): Promise<PlaceSearchResult | null> { return this.client.get('/places/reverse', { lat: coordinate.latitude, lng: coordinate.longitude }, 'kakao-local') }
}

export class RealWalkingProvider implements WalkingProvider {
  constructor(private readonly client: BackendApiClient) {}
  getRoute(from: Coordinate, to: Coordinate): Promise<WalkingRoute> { return this.client.get('/walking', { fromLat: from.latitude, fromLng: from.longitude, toLat: to.latitude, toLng: to.longitude }, 'walking-route') }
}

export class PublicDataBusProvider implements BusProvider {
  constructor(private readonly client: BackendApiClient) {}
  getStops(query?: { coordinate?: Coordinate }): Promise<TransitPoint[]> {
    if (!query?.coordinate) return Promise.reject(new Error('Bus stop search requires a coordinate'))
    return this.client.get('/bus/stops', { lat: query.coordinate.latitude, lng: query.coordinate.longitude })
  }
  getRoutes(query?: { cityCode?: string; routeNo?: string }): Promise<TransitRoute[]> { return this.client.get('/bus/routes', { cityCode: query?.cityCode ?? '11', routeNo: query?.routeNo }) }
  getRouteStops(routeId: RouteId, cityCode = '11'): Promise<TransitPoint[]> { return this.client.get('/bus/route-stops', { cityCode, routeId }) }
  getTrips(_serviceDate: string): Promise<TransitTrip[]> { return Promise.reject(new ProviderUnavailableError('bus-timetable')) }
  getVehiclePositions(routeId?: RouteId): Promise<VehiclePosition[]> {
    if (!routeId) return Promise.resolve([])
    return this.client.get<Array<Omit<VehiclePosition, 'observedAt'> & { observedAt: string }>>('/bus/vehicles', { cityCode: '11', routeId }).then(reviveVehicleDates)
  }
  getArrivals(stopId: StopId): Promise<ArrivalEstimate[]> {
    return this.client.get<Array<Omit<ArrivalEstimate, 'expectedAt'> & { expectedAt: string }>>('/bus/arrivals', { cityCode: '11', stopId }).then(reviveArrivalDates)
  }
}

export class SeoulRealtimeSubwayProvider implements SubwayProvider {
  constructor(private readonly client: BackendApiClient) {}
  getStations(query = '서울역'): Promise<TransitPoint[]> { return this.client.get('/subway/stations', { q: query }) }
  async getRoutes(): Promise<TransitRoute[]> {
    const stations = await this.getStations()
    const lineIds = [...new Set(stations.flatMap((station) => station.kind === 'station' ? station.lineIds : []))]
    return lineIds.map((id) => ({ id, name: id, mode: 'subway', color: '#21a368', stopIds: stations.filter((station) => station.kind === 'station' && station.lineIds.includes(id)).map((station) => station.id) }))
  }
  getTrips(serviceDate: string, query?: { stationId?: StopId; dayType?: string; direction?: string }): Promise<TransitTrip[]> {
    if (!query?.stationId) return Promise.reject(new Error('Subway timetable requires stationId'))
    return this.client.get('/subway/timetable', { stationId: query.stationId, serviceDate, dayType: query.dayType, direction: query.direction })
  }
  getArrivals(stopId: StopId): Promise<ArrivalEstimate[]> {
    return this.client.get<Array<Omit<ArrivalEstimate, 'expectedAt'> & { expectedAt: string }>>('/subway/realtime', { stationName: stopId, stationId: stopId }).then(reviveArrivalDates)
  }
}

export class BackendTransitNetworkProvider implements TransitNetworkProvider {
  constructor(private readonly client: BackendApiClient) {}
  getNetwork(request: { origin: Coordinate; destination: Coordinate; departureTime: number; serviceDate: string }): Promise<TransitNetwork> {
    return this.client.get('/transit/network', { originLat: request.origin.latitude, originLng: request.origin.longitude, destinationLat: request.destination.latitude, destinationLng: request.destination.longitude, departureTime: request.departureTime, serviceDate: request.serviceDate })
  }
}

export function createRealProviderSet(baseUrl: string, fetcher: typeof fetch = fetch): TransitProviderSet {
  const client = new BackendApiClient(baseUrl, fetcher)
  return { place: new KakaoLocalPlaceProvider(client), walking: new RealWalkingProvider(client), bus: new PublicDataBusProvider(client), subway: new SeoulRealtimeSubwayProvider(client), network: new BackendTransitNetworkProvider(client) }
}

function reviveArrivalDates(items: Array<Omit<ArrivalEstimate, 'expectedAt'> & { expectedAt: string }>): ArrivalEstimate[] { return items.map((item) => ({ ...item, expectedAt: new Date(item.expectedAt) })) }
function reviveVehicleDates(items: Array<Omit<VehiclePosition, 'observedAt'> & { observedAt: string }>): VehiclePosition[] { return items.map((item) => ({ ...item, observedAt: new Date(item.observedAt) })) }
