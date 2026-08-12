import type { Coordinate } from '../src/domain/models.js'
import { CACHE_TTL, TtlSingleFlightCache } from './cache.js'
import { ServiceError } from './errors.js'
import {
  normalizeKakaoPlaces,
  normalizeKakaoReverse,
  normalizeKakaoTransitNetwork,
  normalizeKakaoWalking,
  normalizeSeoulRealtime,
  normalizeTagoArrivals,
  normalizeTagoRoutes,
  normalizeTagoRouteStops,
  normalizeTagoStops,
  normalizeTagoSubwayStations,
  normalizeTagoSubwayTrips,
  normalizeTagoVehicles,
} from './normalizers.js'
import { fetchJson, type FetchLike } from './upstream.js'

export interface ServerEnvironment {
  KAKAO_REST_API_KEY?: string
  DATA_GO_KR_SERVICE_KEY?: string
  SEOUL_OPEN_API_KEY?: string
  SEOUL_SUBWAY_REALTIME_API_KEY?: string
  ALLOWED_ORIGIN?: string
}

export class UpstreamProviders {
  constructor(
    private readonly environment: ServerEnvironment,
    private readonly cache = new TtlSingleFlightCache(),
    private readonly fetcher: FetchLike = fetch,
  ) {}

  searchPlaces(query: string) {
    return this.cached('places', { query }, CACHE_TTL.place, async () => normalizeKakaoPlaces(await this.kakao('/v2/local/search/keyword.json', { query, size: '15' })))
  }

  reverseGeocode(coordinate: Coordinate) {
    return this.cached('reverse', coordinate, CACHE_TTL.place, async () => normalizeKakaoReverse(await this.kakao('/v2/local/geo/coord2address.json', { x: String(coordinate.longitude), y: String(coordinate.latitude) }), coordinate))
  }

  walking(from: Coordinate, to: Coordinate) {
    return this.cached('walking', { from, to }, CACHE_TTL.walking, async () => normalizeKakaoWalking(await this.kakao('/v2/routing/walk', {
      start_x: String(from.longitude), start_y: String(from.latitude), end_x: String(to.longitude), end_y: String(to.latitude), route_mode: 'SHORTEST',
    })))
  }

  transitNetwork(origin: Coordinate, destination: Coordinate, departureTime: number, serviceDate: string) {
    return this.cached('network', { origin, destination, departureTime: Math.floor(departureTime / 5), serviceDate }, CACHE_TTL.realtime, async () => normalizeKakaoTransitNetwork(await this.kakao('/v2/routing/publictraffic', {
      start_x: String(origin.longitude), start_y: String(origin.latitude), end_x: String(destination.longitude), end_y: String(destination.latitude),
    }), origin, destination, departureTime, serviceDate))
  }

  busStops(coordinate: Coordinate) {
    return this.cached('bus-stops', coordinate, CACHE_TTL.staticTransit, async () => normalizeTagoStops(await this.tago('/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList', { gpsLati: String(coordinate.latitude), gpsLong: String(coordinate.longitude), numOfRows: '100' })))
  }

  busRoutes(cityCode: string, routeNo?: string) {
    return this.cached('bus-routes', { cityCode, routeNo }, CACHE_TTL.staticTransit, async () => normalizeTagoRoutes(await this.tago('/1613000/BusRouteInfoInqireService/getRouteNoList', { cityCode, routeNo: routeNo ?? '', numOfRows: '100' })))
  }

  busRouteStops(cityCode: string, routeId: string) {
    return this.cached('bus-route-stops', { cityCode, routeId }, CACHE_TTL.staticTransit, async () => normalizeTagoRouteStops(await this.tago('/1613000/BusRouteInfoInqireService/getRouteAcctoSttnList', { cityCode, routeId, numOfRows: '500' })))
  }

  busArrivals(cityCode: string, stopId: string) {
    return this.cached('bus-arrivals', { cityCode, stopId }, CACHE_TTL.realtime, async () => normalizeTagoArrivals(await this.tago('/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList', { cityCode, nodeId: stopId, numOfRows: '100' }), stopId))
  }

  busVehicles(cityCode: string, routeId: string) {
    return this.cached('bus-vehicles', { cityCode, routeId }, CACHE_TTL.realtime, async () => normalizeTagoVehicles(await this.tago('/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList', { cityCode, routeId, numOfRows: '100' }), routeId))
  }

  subwayStations(query: string) {
    return this.cached('subway-stations', { query }, CACHE_TTL.staticTransit, async () => normalizeTagoSubwayStations(await this.tago('/1613000/SubwayInfo/GetKwrdFndSubwaySttnList', { subwayStationName: query, numOfRows: '100' })))
  }

  subwayTimetable(stationId: string, serviceDate: string, dayType = '01', direction = 'U') {
    return this.cached('subway-timetable', { stationId, serviceDate, dayType, direction }, CACHE_TTL.staticTransit, async () => normalizeTagoSubwayTrips(await this.tago('/1613000/SubwayInfo/GetSubwaySttnAcctoSchdulList', { subwayStationId: stationId, dailyTypeCode: dayType, upDownTypeCode: direction, numOfRows: '500' }), serviceDate))
  }

  subwayRealtime(stationName: string, stationId = stationName) {
    return this.cached('subway-realtime', { stationName }, CACHE_TTL.realtime, async () => {
      const key = this.required('SEOUL_SUBWAY_REALTIME_API_KEY')
      const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/20/${encodeURIComponent(stationName)}`
      return normalizeSeoulRealtime(await fetchJson(url, {}, { provider: 'seoul-subway', fetcher: this.fetcher }), stationId)
    })
  }

  seoulStations(stationName = '') {
    return this.cached('seoul-stations', { stationName }, CACHE_TTL.staticTransit, async () => {
      const key = this.required('SEOUL_OPEN_API_KEY')
      const suffix = stationName ? `//${encodeURIComponent(stationName)}` : ''
      const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/SearchSTNBySubwayLineInfo/1/1000${suffix}`
      return fetchJson(url, {}, { provider: 'seoul-open', fetcher: this.fetcher })
    })
  }

  private async kakao(path: string, params: Record<string, string>) {
    const key = this.required('KAKAO_REST_API_KEY'); const url = new URL(path, 'https://dapi.kakao.com')
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
    return fetchJson(url.toString(), { headers: { Authorization: `KakaoAK ${key}` } }, { provider: 'kakao', fetcher: this.fetcher })
  }

  private async tago(path: string, params: Record<string, string>) {
    const key = decodeServiceKey(this.required('DATA_GO_KR_SERVICE_KEY')); const url = new URL(path, 'https://apis.data.go.kr')
    url.searchParams.set('serviceKey', key); url.searchParams.set('_type', 'json'); url.searchParams.set('pageNo', '1')
    Object.entries(params).forEach(([name, value]) => { if (value) url.searchParams.set(name, value) })
    return fetchJson(url.toString(), {}, { provider: 'tago', fetcher: this.fetcher })
  }

  private required(name: keyof ServerEnvironment): string {
    const value = this.environment[name]
    if (!value) throw new ServiceError('NOT_CONFIGURED', 503, `${name} is not configured`)
    return value
  }

  private cached<T>(prefix: string, input: unknown, ttl: number, load: () => Promise<T>): Promise<T> {
    return this.cache.get(`${prefix}:${stableKey(input)}`, ttl, load)
  }
}

const stableKey = (value: unknown): string => JSON.stringify(sortValue(value))
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]))
  return value
}
function decodeServiceKey(key: string): string { try { return decodeURIComponent(key) } catch { return key } }
