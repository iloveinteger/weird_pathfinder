import type { Coordinate, PlaceSearchResult, RouteId, StopId, TransitPoint } from '../domain/models'
import type { ArrivalEstimate, BusProvider, PlaceProvider, SubwayProvider, VehiclePosition, WalkingProvider, WalkingRoute } from '../providers/interfaces'
import { mockPoints, mockRoutes, mockTrips } from './network'

export class MockPlaceProvider implements PlaceProvider {
  async search(query: string): Promise<PlaceSearchResult[]> {
    return mockPoints.filter((point) => point.name.includes(query)).map((point) => ({
      id: point.id, name: point.name, address: `서울특별시 (목업) ${point.name}`, coordinate: point.coordinate,
    }))
  }
  async reverseGeocode(coordinate: Coordinate): Promise<PlaceSearchResult | null> {
    const point = mockPoints.find((candidate) => candidate.coordinate.latitude === coordinate.latitude && candidate.coordinate.longitude === coordinate.longitude)
    return point ? { id: point.id, name: point.name, address: `서울특별시 (목업) ${point.name}`, coordinate } : null
  }
}

export class MockWalkingProvider implements WalkingProvider {
  async getRoute(from: Coordinate, to: Coordinate): Promise<WalkingRoute> {
    const distanceMeters = Math.round(Math.hypot(from.latitude - to.latitude, from.longitude - to.longitude) * 88_000)
    return { distanceMeters, durationMinutes: Math.max(1, Math.ceil(distanceMeters / 75)), path: [from, to] }
  }
}

export class MockBusProvider implements BusProvider {
  async getStops(): Promise<TransitPoint[]> { return mockPoints.filter((point) => point.kind === 'bus-stop') }
  async getRoutes() { return mockRoutes.filter((route) => route.mode === 'bus') }
  async getTrips(serviceDate: string) { return mockTrips.filter((trip) => trip.serviceDate === serviceDate && trip.routeId.startsWith('bus-')) }
  async getVehiclePositions(_routeId?: RouteId): Promise<VehiclePosition[]> { return [] }
  async getArrivals(_stopId: StopId): Promise<ArrivalEstimate[]> { return [] }
}

export class MockSubwayProvider implements SubwayProvider {
  async getStations(): Promise<TransitPoint[]> { return mockPoints.filter((point) => point.kind === 'station') }
  async getRoutes() { return mockRoutes.filter((route) => route.mode === 'subway') }
  async getTrips(serviceDate: string) { return mockTrips.filter((trip) => trip.serviceDate === serviceDate && trip.routeId.startsWith('subway-')) }
  async getArrivals(_stopId: StopId): Promise<ArrivalEstimate[]> { return [] }
}
