import type { StopId, TransitPoint, TransitRoute, TransitTrip } from '../domain/models'

export interface WalkingLink {
  fromStopId: StopId
  toStopId: StopId
  distanceMeters: number
  durationMinutes: number
  purpose: 'access' | 'transfer' | 'egress'
  bidirectional?: boolean
}

export interface TransitNetwork {
  points: TransitPoint[]
  routes: TransitRoute[]
  trips: TransitTrip[]
  walkingLinks: WalkingLink[]
}

export function validateNetwork(network: TransitNetwork): void {
  const stopIds = new Set(network.points.map((point) => point.id))
  const routeIds = new Set(network.routes.map((route) => route.id))
  for (const trip of network.trips) {
    if (!routeIds.has(trip.routeId)) throw new Error(`Unknown route ${trip.routeId}`)
    for (const stop of trip.stops) {
      if (!stopIds.has(stop.stopId)) throw new Error(`Unknown stop ${stop.stopId}`)
    }
  }
  for (const link of network.walkingLinks) {
    if (!stopIds.has(link.fromStopId) || !stopIds.has(link.toStopId)) {
      throw new Error(`Unknown walking link ${link.fromStopId} -> ${link.toStopId}`)
    }
  }
}
