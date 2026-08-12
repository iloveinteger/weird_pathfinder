import type {
  Coordinate,
  PlaceSearchResult,
  RouteId,
  StopId,
  TransitPoint,
  TransitRoute,
  TransitTrip,
  TripId,
} from '../domain/models'
import type { TransitNetwork } from '../routing/network'

export interface WalkingRoute {
  distanceMeters: number
  durationMinutes: number
  path: Coordinate[]
}

export interface VehiclePosition {
  vehicleId: string
  tripId?: TripId
  coordinate: Coordinate
  observedAt: Date
}

export interface ArrivalEstimate {
  stopId: StopId
  routeId: RouteId
  tripId?: TripId
  expectedAt: Date
}

export interface PlaceProvider {
  search(query: string): Promise<PlaceSearchResult[]>
  reverseGeocode(coordinate: Coordinate): Promise<PlaceSearchResult | null>
}

export interface WalkingProvider {
  getRoute(from: Coordinate, to: Coordinate): Promise<WalkingRoute>
}

export interface BusProvider {
  getStops(query?: { coordinate?: Coordinate }): Promise<TransitPoint[]>
  getRoutes(query?: { cityCode?: string; routeNo?: string }): Promise<TransitRoute[]>
  getRouteStops(routeId: RouteId, cityCode?: string): Promise<TransitPoint[]>
  getTrips(serviceDate: string, query?: { cityCode?: string; routeId?: RouteId }): Promise<TransitTrip[]>
  getVehiclePositions(routeId?: RouteId): Promise<VehiclePosition[]>
  getArrivals(stopId: StopId): Promise<ArrivalEstimate[]>
}

export interface SubwayProvider {
  getStations(query?: string): Promise<TransitPoint[]>
  getRoutes(): Promise<TransitRoute[]>
  getTrips(serviceDate: string, query?: { stationId?: StopId; dayType?: string; direction?: string }): Promise<TransitTrip[]>
  getArrivals(stopId: StopId): Promise<ArrivalEstimate[]>
}

export interface TransitNetworkProvider {
  getNetwork(request: { origin: Coordinate; destination: Coordinate; departureTime: number; serviceDate: string }): Promise<TransitNetwork>
}

/** A complete set of normalized data adapters selected at the application boundary. */
export interface TransitProviderSet {
  place: PlaceProvider
  walking: WalkingProvider
  bus: BusProvider
  subway: SubwayProvider
  network: TransitNetworkProvider
}
