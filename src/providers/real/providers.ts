import type { Coordinate, PlaceSearchResult, RouteId, StopId, TransitPoint, TransitRoute, TransitTrip } from '../../domain/models'
import { unavailable } from '../availability'
import type {
  ArrivalEstimate,
  BusProvider,
  PlaceProvider,
  SubwayProvider,
  TransitProviderSet,
  VehiclePosition,
  WalkingProvider,
  WalkingRoute,
} from '../interfaces'

/** Future browser adapter to the project backend's Kakao Local endpoint. */
export class KakaoLocalPlaceProvider implements PlaceProvider {
  search(_query: string): Promise<PlaceSearchResult[]> { return unavailable('kakao-local') }
  reverseGeocode(_coordinate: Coordinate): Promise<PlaceSearchResult | null> { return unavailable('kakao-local') }
}

/** Walking data source is intentionally undecided; Kakao Maps JS is display-only. */
export class RealWalkingProvider implements WalkingProvider {
  getRoute(_from: Coordinate, _to: Coordinate): Promise<WalkingRoute> { return unavailable('walking-route') }
}

/** Future browser adapter to the project backend's 공공데이터포털/TAGO endpoint. */
export class PublicDataBusProvider implements BusProvider {
  getStops(): Promise<TransitPoint[]> { return unavailable('public-data-bus') }
  getRoutes(): Promise<TransitRoute[]> { return unavailable('public-data-bus') }
  getTrips(_serviceDate: string): Promise<TransitTrip[]> { return unavailable('public-data-bus') }
  getVehiclePositions(_routeId?: RouteId): Promise<VehiclePosition[]> { return unavailable('public-data-bus') }
  getArrivals(_stopId: StopId): Promise<ArrivalEstimate[]> { return unavailable('public-data-bus') }
}

/** Future browser adapter to the project backend's Seoul subway realtime endpoint. */
export class SeoulRealtimeSubwayProvider implements SubwayProvider {
  getStations(): Promise<TransitPoint[]> { return unavailable('seoul-subway-realtime') }
  getRoutes(): Promise<TransitRoute[]> { return unavailable('seoul-subway-realtime') }
  getTrips(_serviceDate: string): Promise<TransitTrip[]> { return unavailable('seoul-subway-realtime') }
  getArrivals(_stopId: StopId): Promise<ArrivalEstimate[]> { return unavailable('seoul-subway-realtime') }
}

export function createRealProviderSet(): TransitProviderSet {
  return {
    place: new KakaoLocalPlaceProvider(),
    walking: new RealWalkingProvider(),
    bus: new PublicDataBusProvider(),
    subway: new SeoulRealtimeSubwayProvider(),
  }
}
