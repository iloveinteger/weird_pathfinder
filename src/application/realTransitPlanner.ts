import type { Journey, PlaceSearchResult } from '../domain/models'
import type { TransitProviderSet } from '../providers/interfaces'
import { TimeDependentRouter } from '../routing/router'
import { CoreTransitPlanner, type PlannedRoute, type PlannerSearchRequest, type TransitPlanner } from './transitPlanner'

/** Loads an immutable normalized snapshot per leg, then delegates all search to the existing core. */
export class RealTransitPlanner implements TransitPlanner {
  private readonly places = new Map<string, PlaceSearchResult>()
  private readonly pointNames = new Map<string, string>()

  constructor(private readonly providers: TransitProviderSet) {}

  async searchPlaces(query: string): Promise<PlaceSearchResult[]> {
    if (!query.trim()) return []
    const results = await this.providers.place.search(query.trim())
    results.forEach((place) => { this.places.set(place.id, place); this.pointNames.set(place.id, place.name) })
    return results
  }

  pointName(id: string): string { return this.pointNames.get(id) ?? id }

  async findRoutes(request: PlannerSearchRequest): Promise<PlannedRoute[]> {
    const ids = [request.originId, ...request.waypoints.map((waypoint) => waypoint.placeId), request.destinationId]
    const legs: PlannedRoute[] = []
    let departureTime = request.departureTime
    for (let index = 0; index < ids.length - 1; index++) {
      const origin = this.places.get(ids[index]); const destination = this.places.get(ids[index + 1])
      if (!origin || !destination) throw new Error('Select origin and destination from place search results')
      const network = await this.providers.network.getNetwork({ origin: origin.coordinate, destination: destination.coordinate, departureTime, serviceDate: localServiceDate() })
      network.points.forEach((point) => this.pointNames.set(point.id, point.name))
      network.routes.forEach((route) => this.pointNames.set(route.id, route.name))
      const planner = new CoreTransitPlanner(this.providers.place, new TimeDependentRouter(network), network.points)
      const found = await planner.findRoutes({ ...request, originId: 'origin', destinationId: 'destination', departureTime, waypoints: [] })
      if (!found.length) return []
      legs.push(found[0])
      departureTime = found[0].bestPossibleArrival + (request.waypoints[index]?.dwellMinutes ?? 0)
    }
    return legs.length === 1 ? legs : [combineRoutes(legs, request.departureTime)]
  }
}

function combineRoutes(routes: PlannedRoute[], departureTime: number): PlannedRoute {
  const journeys = routes.map((route) => route.variants[0].journey)
  const journey: Journey = {
    id: `real-combined-${routes.map((route) => route.id).join('-')}`,
    departureTime,
    arrivalTime: journeys.at(-1)?.arrivalTime ?? departureTime,
    segments: journeys.flatMap((item) => item.segments),
    transfers: journeys.flatMap((item) => item.transfers),
    transferCount: journeys.reduce((sum, item) => sum + item.transferCount, 0),
    walkingDistanceMeters: journeys.reduce((sum, item) => sum + item.walkingDistanceMeters, 0),
    mergedAlternativeIds: journeys.flatMap((item) => item.mergedAlternativeIds),
  }
  const firstVariant = routes[0].variants[0]
  return {
    id: journey.id,
    hard: routes.some((route) => route.hard),
    patternKey: routes.map((route) => route.patternKey).join('>'),
    bestPossibleArrival: journey.arrivalTime,
    aggressiveTransferCount: routes.reduce((sum, route) => sum + route.aggressiveTransferCount, 0),
    variants: [{ ...firstVariant, id: `${journey.id}-variant`, arrivalTime: journey.arrivalTime, journey, transferChoices: routes.flatMap((route) => route.variants[0].transferChoices) }],
    waypointArrivals: routes.slice(0, -1).map((route) => route.bestPossibleArrival),
  }
}

function localServiceDate(): string {
  const now = new Date(); const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
