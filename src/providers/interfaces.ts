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
  getStops(): Promise<TransitPoint[]>
  getRoutes(): Promise<TransitRoute[]>
  getTrips(serviceDate: string): Promise<TransitTrip[]>
  getVehiclePositions(routeId?: RouteId): Promise<VehiclePosition[]>
  getArrivals(stopId: StopId): Promise<ArrivalEstimate[]>
}

export interface SubwayProvider {
  getStations(): Promise<TransitPoint[]>
  getRoutes(): Promise<TransitRoute[]>
  getTrips(serviceDate: string): Promise<TransitTrip[]>
  getArrivals(stopId: StopId): Promise<ArrivalEstimate[]>
}
