import type { Journey, PlaceSearchResult, TransferPace, TransitPoint, WalkSegment } from '../domain/models'
import type { PlaceProvider } from '../providers/interfaces'
import type { TimeDependentRouter } from '../routing/router'
import type { HardRouteCandidate, TimingVariant } from '../routing/hard/types'

export type PlannerMode = 'transfers' | 'walking' | 'time' | 'hard'

export interface PlannerWaypointInput {
  id: string
  placeId: string
  name: string
  dwellMinutes: number
}

export interface PlannerSearchRequest {
  originId: string
  destinationId: string
  departureTime: number
  waypoints: PlannerWaypointInput[]
  mode: PlannerMode
}

export interface PlannedRoute {
  id: string
  hard: boolean
  patternKey: string
  bestPossibleArrival: number
  standardWalkingArrival?: number
  aggressiveTransferCount: number
  variants: TimingVariant[]
  waypointArrivals: number[]
}

export interface TransitPlanner {
  searchPlaces(query: string): Promise<PlaceSearchResult[]>
  findRoutes(request: PlannerSearchRequest): Promise<PlannedRoute[]>
  pointName(id: string): string
}

export class CoreTransitPlanner implements TransitPlanner {
  private readonly pointNames: ReadonlyMap<string, string>

  constructor(
    private readonly placeProvider: PlaceProvider,
    private readonly router: TimeDependentRouter,
    points: TransitPoint[],
  ) {
    this.pointNames = new Map(points.map((point) => [point.id, point.name]))
  }

  searchPlaces(query: string): Promise<PlaceSearchResult[]> {
    return this.placeProvider.search(query.trim())
  }

  pointName(id: string): string {
    return this.pointNames.get(id) ?? id
  }

  async findRoutes(request: PlannerSearchRequest): Promise<PlannedRoute[]> {
    if (request.mode === 'hard') return this.findHardRoutes(request)
    const ids = [request.originId, ...request.waypoints.map((waypoint) => waypoint.placeId), request.destinationId]
    if (request.waypoints.length) {
      const journey = this.routeNormalSequence(ids, request)
      return journey ? [normalRoute(journey, request.waypoints.map((_, index) => journey.legArrivals[index]))] : []
    }

    const journeys = this.router.findJourneys({
      originId: request.originId,
      destinationId: request.destinationId,
      departureTime: request.departureTime,
      mode: 'normal',
      maxJourneys: 3,
    })
    journeys.sort(normalComparator(request.mode))
    return journeys.map((journey) => normalRoute({ journey, legArrivals: [] }, []))
  }

  private findHardRoutes(request: PlannerSearchRequest): PlannedRoute[] {
    if (!request.waypoints.length) {
      return this.router.findHardRouteCandidates({
        originId: request.originId,
        destinationId: request.destinationId,
        departureTime: request.departureTime,
        maxJourneys: 3,
      }).candidates.map(hardRoute)
    }

    const preferences: TransferPace[] = ['fast', 'standard', 'relaxed']
    const variants = preferences.flatMap((pace, index) => {
      const routed = this.routeHardSequence(request, pace)
      return routed ? [toTimingVariant(routed.journey, routed.transferChoices, pace, index)] : []
    })
    if (!variants.length) return []
    variants.sort((a, b) => a.arrivalTime - b.arrivalTime)
    const routeIds = variants[0].journey.segments.filter((segment) => segment.type === 'transit').map((segment) => segment.routeId)
    return [{
      id: 'hard-multi-stop',
      hard: true,
      patternKey: routeIds.join('>') || 'walk-only',
      bestPossibleArrival: variants[0].arrivalTime,
      standardWalkingArrival: variants.find((variant) => variant.standardWalking)?.arrivalTime,
      aggressiveTransferCount: variants[0].transferChoices.filter((choice) => choice.pace === 'fast').length,
      variants,
      waypointArrivals: this.routeHardSequence(request, 'fast')?.legArrivals.slice(0, -1) ?? [],
    }]
  }

  private routeNormalSequence(ids: string[], request: PlannerSearchRequest): { journey: Journey; legArrivals: number[] } | null {
    const legs: Journey[] = []
    const legArrivals: number[] = []
    let departureTime = request.departureTime
    for (let index = 0; index < ids.length - 1; index++) {
      const leg = this.router.findJourneys({
        originId: ids[index], destinationId: ids[index + 1], departureTime, mode: 'normal', maxJourneys: 1,
      })[0]
      if (!leg) return null
      legs.push(leg)
      legArrivals.push(leg.arrivalTime)
      departureTime = leg.arrivalTime + (request.waypoints[index]?.dwellMinutes ?? 0)
    }
    return { journey: combineJourneys(legs, request.departureTime), legArrivals }
  }

  private routeHardSequence(request: PlannerSearchRequest, pace: TransferPace): {
    journey: Journey
    transferChoices: TimingVariant['transferChoices']
    legArrivals: number[]
  } | null {
    const ids = [request.originId, ...request.waypoints.map((waypoint) => waypoint.placeId), request.destinationId]
    const legs: Journey[] = []
    const transferChoices: TimingVariant['transferChoices'] = []
    const legArrivals: number[] = []
    let departureTime = request.departureTime
    for (let index = 0; index < ids.length - 1; index++) {
      const candidates = this.router.findHardRouteCandidates({
        originId: ids[index], destinationId: ids[index + 1], departureTime, maxJourneys: 5,
      }).candidates
      const allVariants = candidates.flatMap((candidate) => candidate.timingVariants)
      const matching = allVariants.find((variant) => variantMatchesPace(variant, pace))
        ?? (pace === 'fast' ? allVariants[0] : undefined)
      if (!matching) return null
      legs.push(matching.journey)
      transferChoices.push(...matching.transferChoices)
      legArrivals.push(matching.arrivalTime)
      departureTime = matching.arrivalTime + (request.waypoints[index]?.dwellMinutes ?? 0)
    }
    return { journey: combineJourneys(legs, request.departureTime), transferChoices, legArrivals }
  }
}

function normalComparator(mode: Exclude<PlannerMode, 'hard'>): (a: Journey, b: Journey) => number {
  if (mode === 'transfers') return (a, b) => a.transferCount - b.transferCount || a.arrivalTime - b.arrivalTime
  if (mode === 'walking') return (a, b) => a.walkingDistanceMeters - b.walkingDistanceMeters || a.arrivalTime - b.arrivalTime
  return (a, b) => a.arrivalTime - b.arrivalTime
}

function normalRoute(routed: { journey: Journey; legArrivals: number[] }, waypointArrivals: number[]): PlannedRoute {
  return {
    id: routed.journey.id,
    hard: false,
    patternKey: routed.journey.segments.filter((segment) => segment.type === 'transit').map((segment) => segment.routeId).join('>') || 'walk-only',
    bestPossibleArrival: routed.journey.arrivalTime,
    aggressiveTransferCount: 0,
    variants: [toTimingVariant(routed.journey, [], 'standard', 0)],
    waypointArrivals,
  }
}

function hardRoute(candidate: HardRouteCandidate): PlannedRoute {
  return {
    id: candidate.patternKey,
    hard: true,
    patternKey: candidate.patternKey,
    bestPossibleArrival: candidate.bestPossibleArrival,
    standardWalkingArrival: candidate.standardWalkingArrival,
    aggressiveTransferCount: candidate.aggressiveTransferCount,
    variants: candidate.timingVariants,
    waypointArrivals: [],
  }
}

function variantMatchesPace(variant: TimingVariant, pace: TransferPace): boolean {
  const transferWalks = variant.journey.segments.filter((segment): segment is WalkSegment => segment.type === 'walk' && segment.purpose === 'transfer')
  return transferWalks.every((segment) => segment.pace === pace)
    && variant.transferChoices.every((choice) => choice.pace === pace)
    && (transferWalks.length > 0 || variant.transferChoices.length > 0 || pace === 'standard')
}

function toTimingVariant(
  journey: Journey,
  transferChoices: TimingVariant['transferChoices'],
  pace: TransferPace,
  index: number,
): TimingVariant {
  return {
    id: `combined-${pace}-${index}`,
    arrivalTime: journey.arrivalTime,
    standardWalking: pace === 'standard',
    tripIds: journey.segments.filter((segment) => segment.type === 'transit').map((segment) => segment.tripId),
    transferChoices,
    journey,
  }
}

function combineJourneys(legs: Journey[], departureTime: number): Journey {
  return {
    id: `combined-${legs.map((leg) => leg.id).join('-')}`,
    departureTime,
    arrivalTime: legs.at(-1)?.arrivalTime ?? departureTime,
    segments: legs.flatMap((leg) => leg.segments),
    transfers: legs.flatMap((leg) => leg.transfers),
    transferCount: legs.reduce((sum, leg) => sum + leg.transferCount, 0),
    walkingDistanceMeters: legs.reduce((sum, leg) => sum + leg.walkingDistanceMeters, 0),
    mergedAlternativeIds: legs.flatMap((leg) => leg.mergedAlternativeIds),
  }
}
