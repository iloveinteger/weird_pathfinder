import type { TransitSegment, TransitTrip, WalkSegment } from '../../domain/models'
import { ROUTING_POLICIES } from '../mode'
import type { TransitNetwork, WalkingLink } from '../network'
import { validateNetwork } from '../network'
import { hardStateSignature, insertHardPareto } from './pareto'
import { groupHardRouteCandidates } from './results'
import type {
  AggressiveTransferChoice,
  HardRoutingResult,
  HardSearchDiagnostics,
  HardSearchState,
} from './types'

export interface HardRoutingRequest {
  originId: string
  destinationId: string
  departureTime: number
  maxRouteCandidates?: number
}

interface BoardingOption {
  trip: TransitTrip
  boardingIndex: number
}

/**
 * Correctness-first, time-dependent multi-label search for aggressive routes.
 * It enumerates every catchable scheduled vehicle; the three walking profiles
 * describe physical transfer timing, not a cap on vehicle candidates.
 */
export class HardRouter {
  private readonly walkingFrom = new Map<string, WalkingLink[]>()
  private readonly boardingsFrom = new Map<string, BoardingOption[]>()
  private readonly routeModes = new Map<string, 'bus' | 'subway'>()
  private nextStateId = 0

  constructor(private readonly network: TransitNetwork) {
    validateNetwork(network)
    for (const route of network.routes) this.routeModes.set(route.id, route.mode)
    for (const link of network.walkingLinks) {
      this.addWalkingLink(link)
      if (link.bidirectional) {
        this.addWalkingLink({ ...link, fromStopId: link.toStopId, toStopId: link.fromStopId, bidirectional: false })
      }
    }
    for (const trip of network.trips) {
      trip.stops.forEach((_, boardingIndex) => {
        if (boardingIndex === trip.stops.length - 1) return
        const stopId = trip.stops[boardingIndex].stopId
        const options = this.boardingsFrom.get(stopId) ?? []
        options.push({ trip, boardingIndex })
        this.boardingsFrom.set(stopId, options)
      })
    }
    for (const options of this.boardingsFrom.values()) {
      options.sort((a, b) => a.trip.stops[a.boardingIndex].departureTime - b.trip.stops[b.boardingIndex].departureTime)
    }
  }

  search(request: HardRoutingRequest): HardRoutingResult {
    const startedAt = performance.now()
    const diagnostics: HardSearchDiagnostics = {
      generatedStates: 1,
      expandedStates: 0,
      dominatedStates: 0,
      mergedStates: 0,
      boundPrunedStates: 0,
      maxQueueSize: 1,
      elapsedMilliseconds: 0,
    }
    const start: HardSearchState = {
      id: this.id(),
      locationId: request.originId,
      time: request.departureTime,
      transferCount: 0,
      transitBoardings: 0,
      walkingMinutes: 0,
      walkingDistanceMeters: 0,
      aggressiveTransferCount: 0,
      aggressiveMinutesSaved: 0,
      transferChoices: [],
      routePattern: [],
      mergedPredecessors: [],
    }
    const queue: HardSearchState[] = [start]
    const states = new Map<string, HardSearchState>([[start.id, start]])
    const frontiers = new Map<string, HardSearchState[]>([[hardStateSignature(start), [start]]])
    const terminals: HardSearchState[] = []
    const patternBest = new Map<string, number>()
    const maxPatterns = request.maxRouteCandidates ?? 8

    while (queue.length) {
      queue.sort((a, b) => a.time - b.time)
      const state = queue.shift()!
      const active = frontiers.get(hardStateSignature(state))?.some((item) => item.id === state.id)
      if (!active) continue

      const arrivalBound = topKArrivalBound(patternBest, maxPatterns)
      if (state.time > arrivalBound) {
        diagnostics.boundPrunedStates += 1 + queue.length
        break
      }

      diagnostics.expandedStates++
      for (const link of this.walkingFrom.get(state.locationId) ?? []) {
        for (const next of this.walkStates(state, link)) {
          this.accept(next, request.destinationId, queue, states, frontiers, terminals, patternBest, diagnostics)
        }
      }

      // Intentionally no slice/maxBoardingOptions: every catchable trip may
      // overtake another trip or unlock a different downstream connection.
      for (const option of this.boardingsFrom.get(state.locationId) ?? []) {
        const boardingStop = option.trip.stops[option.boardingIndex]
        if (boardingStop.departureTime < state.time || option.trip.id === state.currentTripId) continue
        for (let alightingIndex = option.boardingIndex + 1; alightingIndex < option.trip.stops.length; alightingIndex++) {
          const next = this.rideState(state, option, alightingIndex)
          this.accept(next, request.destinationId, queue, states, frontiers, terminals, patternBest, diagnostics)
        }
      }
      diagnostics.maxQueueSize = Math.max(diagnostics.maxQueueSize, queue.length)
    }

    diagnostics.elapsedMilliseconds = performance.now() - startedAt
    return {
      candidates: groupHardRouteCandidates(terminals, states, request.departureTime).slice(0, maxPatterns),
      diagnostics,
    }
  }

  private walkStates(state: HardSearchState, link: WalkingLink): HardSearchState[] {
    const profiles = link.purpose === 'transfer'
      ? ROUTING_POLICIES.hard.transferProfiles
      : [{ pace: 'standard' as const, durationMultiplier: 1 }]
    return profiles.map((profile) => {
      const duration = Math.max(1, Math.ceil(link.durationMinutes * profile.durationMultiplier))
      const saved = profile.pace === 'fast' ? Math.max(0, link.durationMinutes - duration) : 0
      const segment: WalkSegment = {
        type: 'walk',
        fromStopId: link.fromStopId,
        toStopId: link.toStopId,
        departureTime: state.time,
        arrivalTime: state.time + duration,
        durationMinutes: duration,
        distanceMeters: link.distanceMeters,
        purpose: link.purpose,
        pace: profile.pace,
      }
      return {
        ...state,
        id: this.id(),
        locationId: link.toStopId,
        time: segment.arrivalTime,
        walkingMinutes: state.walkingMinutes + duration,
        walkingDistanceMeters: state.walkingDistanceMeters + link.distanceMeters,
        aggressiveTransferCount: state.aggressiveTransferCount + (profile.pace === 'fast' ? 1 : 0),
        aggressiveMinutesSaved: state.aggressiveMinutesSaved + saved,
        pendingTransfer: link.purpose === 'transfer' ? {
          atStopId: link.toStopId,
          fromTripId: state.currentTripId,
          pace: profile.pace,
          requiredMinutes: duration,
          standardMinutes: link.durationMinutes,
          readyTime: segment.arrivalTime,
        } : state.pendingTransfer,
        predecessor: { stateId: state.id, segment },
        mergedPredecessors: [],
      }
    })
  }

  private rideState(state: HardSearchState, option: BoardingOption, alightingIndex: number): HardSearchState {
    const boarding = option.trip.stops[option.boardingIndex]
    const alighting = option.trip.stops[alightingIndex]
    const segment: TransitSegment = {
      type: 'transit',
      mode: this.routeModes.get(option.trip.routeId)!,
      routeId: option.trip.routeId,
      tripId: option.trip.id,
      fromStopId: boarding.stopId,
      toStopId: alighting.stopId,
      departureTime: boarding.departureTime,
      arrivalTime: alighting.arrivalTime,
      boardingSequence: boarding.sequence,
      alightingSequence: alighting.sequence,
    }
    const isTransfer = state.transitBoardings > 0
    const transferChoice: AggressiveTransferChoice | undefined = isTransfer ? {
      id: `${state.id}>${option.trip.id}`,
      atStopId: state.pendingTransfer?.atStopId ?? state.locationId,
      fromTripId: state.pendingTransfer?.fromTripId ?? state.currentTripId,
      toTripId: option.trip.id,
      pace: state.pendingTransfer?.pace ?? 'standard',
      requiredMinutes: state.pendingTransfer?.requiredMinutes ?? 0,
      standardMinutes: state.pendingTransfer?.standardMinutes ?? 0,
      readyTime: state.pendingTransfer?.readyTime ?? state.time,
      vehicleDepartureTime: boarding.departureTime,
      vehicleArrivalTime: alighting.arrivalTime,
    } : undefined
    return {
      ...state,
      id: this.id(),
      locationId: alighting.stopId,
      time: alighting.arrivalTime,
      currentRouteId: option.trip.routeId,
      currentTripId: option.trip.id,
      transferCount: state.transferCount + (isTransfer ? 1 : 0),
      transitBoardings: state.transitBoardings + 1,
      transferChoices: transferChoice ? [...state.transferChoices, transferChoice] : state.transferChoices,
      routePattern: [...state.routePattern, option.trip.routeId],
      pendingTransfer: undefined,
      predecessor: { stateId: state.id, segment },
      mergedPredecessors: [],
    }
  }

  private accept(
    candidate: HardSearchState,
    destinationId: string,
    queue: HardSearchState[],
    states: Map<string, HardSearchState>,
    frontiers: Map<string, HardSearchState[]>,
    terminals: HardSearchState[],
    patternBest: Map<string, number>,
    diagnostics: HardSearchDiagnostics,
  ): void {
    diagnostics.generatedStates++
    states.set(candidate.id, candidate)

    // Record destination timing variants before frontier pruning. A slower
    // standard variant can be valuable metadata beside a faster aggressive one.
    if (candidate.locationId === destinationId) {
      terminals.push(candidate)
      const pattern = candidate.routePattern.length ? candidate.routePattern.join('>') : 'walk-only'
      patternBest.set(pattern, Math.min(patternBest.get(pattern) ?? Infinity, candidate.time))
      return
    }

    const signature = hardStateSignature(candidate)
    const current = frontiers.get(signature) ?? []
    const inserted = insertHardPareto(current, candidate)
    frontiers.set(signature, inserted.frontier)
    if (inserted.dominated) {
      diagnostics.dominatedStates++
      return
    }
    if (inserted.merged) {
      diagnostics.mergedStates++
      if (inserted.accepted) states.set(inserted.accepted.id, inserted.accepted)
      return
    }
    queue.push(candidate)
  }

  private addWalkingLink(link: WalkingLink): void {
    const links = this.walkingFrom.get(link.fromStopId) ?? []
    links.push(link)
    this.walkingFrom.set(link.fromStopId, links)
  }

  private id(): string {
    return `hard-state-${++this.nextStateId}`
  }
}

function topKArrivalBound(patternBest: ReadonlyMap<string, number>, maxPatterns: number): number {
  if (patternBest.size < maxPatterns) return Infinity
  return [...patternBest.values()].sort((a, b) => a - b)[maxPatterns - 1]
}
