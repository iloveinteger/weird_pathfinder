export type StopId = string
export type RouteId = string
export type TripId = string
export type Minutes = number

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface Stop {
  id: StopId
  kind: 'bus-stop' | 'place'
  name: string
  coordinate: Coordinate
}

export interface Station {
  id: StopId
  kind: 'station'
  name: string
  coordinate: Coordinate
  lineIds: RouteId[]
  platformCode?: string
  parentStationId?: StopId
}

export type TransitPoint = Stop | Station
export type TransitMode = 'bus' | 'subway'

export interface TransitRoute {
  id: RouteId
  name: string
  mode: TransitMode
  color: string
  stopIds: StopId[]
  path?: Coordinate[]
}

export interface ScheduledStop {
  stopId: StopId
  arrivalTime: Minutes
  departureTime: Minutes
  sequence: number
}

export interface TransitTrip {
  id: TripId
  routeId: RouteId
  headsign: string
  serviceDate: string
  stops: ScheduledStop[]
}

export interface WalkSegment {
  type: 'walk'
  fromStopId: StopId
  toStopId: StopId
  departureTime: Minutes
  arrivalTime: Minutes
  durationMinutes: Minutes
  distanceMeters: number
  purpose: 'access' | 'transfer' | 'egress'
  pace: TransferPace
  path?: Coordinate[]
}

export interface TransitSegment {
  type: 'transit'
  mode: TransitMode
  routeId: RouteId
  tripId: TripId
  fromStopId: StopId
  toStopId: StopId
  departureTime: Minutes
  arrivalTime: Minutes
  boardingSequence: number
  alightingSequence: number
  path?: Coordinate[]
}

export type JourneySegment = WalkSegment | TransitSegment
export type TransferPace = 'fast' | 'standard' | 'relaxed'

export interface Transfer {
  atStopId: StopId
  fromTripId?: TripId
  toTripId?: TripId
  pace: TransferPace
  readyTime: Minutes
  waitMinutes: Minutes
  walkMinutes: Minutes
}

export interface Journey {
  id: string
  departureTime: Minutes
  arrivalTime: Minutes
  segments: JourneySegment[]
  transfers: Transfer[]
  transferCount: number
  walkingDistanceMeters: number
  mergedAlternativeIds: string[]
}

export interface Waypoint {
  id: string
  placeId: StopId
  name: string
  dwellMinutes: Minutes
}

export interface PlaceSearchResult {
  id: string
  name: string
  address: string
  coordinate: Coordinate
}

export function isStation(point: TransitPoint): point is Station {
  return point.kind === 'station'
}
