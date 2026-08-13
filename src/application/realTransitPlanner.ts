import type { Journey, PlaceSearchResult } from '../domain/models'
import type { TransitProviderSet } from '../providers/interfaces'
import type { TransitNetwork, WalkingLink } from '../routing/network'
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
    let candidates: RouteSequence[] = [{ routes: [], departureTime: request.departureTime }]
    for (let index = 0; index < ids.length - 1; index++) {
      const origin = this.places.get(ids[index]); const destination = this.places.get(ids[index + 1])
      if (!origin || !destination) throw new Error('Select origin and destination from place search results')
      const expanded = (await Promise.all(candidates.map(async (candidate) => {
        const snapshot = await this.providers.network.getNetwork({ origin: origin.coordinate, destination: destination.coordinate, departureTime: candidate.departureTime, serviceDate: localServiceDate() })
        const network = await this.withWalkingRoutes(snapshot)
        network.points.forEach((point) => this.pointNames.set(point.id, point.name))
        network.routes.forEach((route) => this.pointNames.set(route.id, route.name))
        const planner = new CoreTransitPlanner(this.providers.place, new TimeDependentRouter(network), network.points)
        const found = await planner.findRoutes({ ...request, originId: 'origin', destinationId: 'destination', departureTime: candidate.departureTime, waypoints: [] })
        return found.slice(0, MAX_RECOMMENDATIONS).map((route) => ({
          routes: [...candidate.routes, route],
          departureTime: route.bestPossibleArrival + (request.waypoints[index]?.dwellMinutes ?? 0),
        }))
      }))).flat()
      if (!expanded.length) return []
      candidates = expanded.sort(sequenceComparator(request.mode)).slice(0, MAX_RECOMMENDATIONS)
    }
    return candidates.map((candidate) => candidate.routes.length === 1 ? candidate.routes[0] : combineRoutes(candidate.routes, request.departureTime))
  }

  private async withWalkingRoutes(network: TransitNetwork): Promise<TransitNetwork> {
    const points = new Map(network.points.map((point) => [point.id, point.coordinate]))
    const boardingStopIds = new Set(network.trips.flatMap((trip) => trip.stops.slice(0, -1).map((stop) => stop.stopId)))
    const walkingLinks = await Promise.all(network.walkingLinks.map(async (link): Promise<WalkingLink> => {
      const from = points.get(link.fromStopId); const to = points.get(link.toStopId)
      if (!from || !to) return link
      try {
        const route = await this.providers.walking.getRoute(from, to)
        // Access/transfer duration is already baked into the upstream candidate's
        // synthetic departure times. Keep it stable so richer geometry cannot
        // make the advertised vehicle impossible to board.
        const durationMinutes = boardingStopIds.has(link.toStopId) ? link.durationMinutes : route.durationMinutes
        return { ...link, distanceMeters: route.distanceMeters, durationMinutes, path: route.path }
      } catch {
        return link
      }
    }))
    return { ...network, walkingLinks }
  }
}

const MAX_RECOMMENDATIONS = 3
interface RouteSequence { routes: PlannedRoute[]; departureTime: number }

function sequenceComparator(mode: PlannerSearchRequest['mode']): (left: RouteSequence, right: RouteSequence) => number {
  const metrics = (sequence: RouteSequence) => {
    const journeys = sequence.routes.map((route) => route.variants[0].journey)
    return {
      arrival: sequence.routes.at(-1)?.bestPossibleArrival ?? sequence.departureTime,
      transfers: journeys.reduce((sum, journey) => sum + journey.transferCount, 0),
      walking: journeys.reduce((sum, journey) => sum + journey.walkingDistanceMeters, 0),
    }
  }
  return (left, right) => {
    const a = metrics(left); const b = metrics(right)
    if (mode === 'transfers') return a.transfers - b.transfers || a.arrival - b.arrival || a.walking - b.walking
    if (mode === 'walking') return a.walking - b.walking || a.arrival - b.arrival || a.transfers - b.transfers
    return a.arrival - b.arrival || a.transfers - b.transfers || a.walking - b.walking
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
