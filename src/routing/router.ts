import type { Journey, TransitSegment, TransitTrip } from '../domain/models'
import type { RoutingMode } from './mode'
import { ROUTING_POLICIES } from './mode'
import type { TransitNetwork, WalkingLink } from './network'
import { validateNetwork } from './network'
import { branchAcrossWalkingLink } from './transferBranching'
import { criteriaOf, dominates, mergeEquivalentStates, type RoutingState } from './state'
import { HardRouter } from './hard/hardRouter'
import type { HardRoutingResult } from './hard/types'

export interface RoutingRequest {
  originId: string
  destinationId: string
  departureTime: number
  mode: RoutingMode
  maxJourneys?: number
}

interface BoardingOption {
  trip: TransitTrip
  boardingIndex: number
}

export class TimeDependentRouter {
  private readonly walkingFrom = new Map<string, WalkingLink[]>()
  private readonly boardingsFrom = new Map<string, BoardingOption[]>()
  private readonly routeModes = new Map<string, 'bus' | 'subway'>()
  private readonly hardRouter: HardRouter

  constructor(private readonly network: TransitNetwork) {
    validateNetwork(network)
    this.hardRouter = new HardRouter(network)
    for (const route of network.routes) this.routeModes.set(route.id, route.mode)
    for (const link of network.walkingLinks) {
      this.addWalkingLink(link)
      if (link.bidirectional) this.addWalkingLink({ ...link, fromStopId: link.toStopId, toStopId: link.fromStopId })
    }
    for (const trip of network.trips) {
      trip.stops.forEach((stop, boardingIndex) => {
        if (boardingIndex === trip.stops.length - 1) return
        const options = this.boardingsFrom.get(stop.stopId) ?? []
        options.push({ trip, boardingIndex })
        this.boardingsFrom.set(stop.stopId, options)
      })
    }
    for (const options of this.boardingsFrom.values()) {
      options.sort((a, b) => a.trip.stops[a.boardingIndex].departureTime - b.trip.stops[b.boardingIndex].departureTime)
    }
  }

  findJourneys(request: RoutingRequest): Journey[] {
    if (request.mode === 'hard') {
      return this.findHardRouteCandidates({ ...request, mode: 'hard' }).candidates
        .flatMap((candidate) => candidate.timingVariants)
        .sort((a, b) => a.arrivalTime - b.arrivalTime)
        .slice(0, request.maxJourneys ?? 5)
        .map((variant) => variant.journey)
    }
    const policy = ROUTING_POLICIES[request.mode]
    const maxJourneys = request.maxJourneys ?? 5
    const start: RoutingState = {
      id: 'origin',
      locationId: request.originId,
      time: request.departureTime,
      segments: [],
      transfers: [],
      walkingDistanceMeters: 0,
      transitBoardings: 0,
      mergedAlternativeIds: [],
    }
    const queue: RoutingState[] = [start]
    const frontier = new Map<string, RoutingState[]>()
    frontier.set(start.locationId, [start])
    const arrivals: RoutingState[] = []
    let expansions = 0
    const expansionLimit = 2_000

    while (queue.length && expansions++ < expansionLimit) {
      queue.sort((a, b) => a.time - b.time)
      const state = queue.shift()!
      if (state.locationId === request.destinationId) {
        arrivals.push(state)
        if (arrivals.length >= maxJourneys * 4) break
        continue
      }
      if (state.segments.length >= 12) continue

      for (const link of this.walkingFrom.get(state.locationId) ?? []) {
        for (const next of branchAcrossWalkingLink(state, link, policy)) this.enqueue(next, frontier, queue)
      }

      const available = (this.boardingsFrom.get(state.locationId) ?? [])
        .filter(({ trip, boardingIndex }) => trip.stops[boardingIndex].departureTime >= state.time)
        .filter(({ trip }) => trip.id !== state.lastTripId)
        .slice(0, policy.maxBoardingOptions)

      const boardedStates: RoutingState[] = []
      for (const { trip, boardingIndex } of available) {
        if (state.transitBoardings > policy.maxTransfers) continue
        const boardingStop = trip.stops[boardingIndex]
        for (let alightingIndex = boardingIndex + 1; alightingIndex < trip.stops.length; alightingIndex++) {
          const alightingStop = trip.stops[alightingIndex]
          const segment: TransitSegment = {
            type: 'transit',
            mode: this.routeModes.get(trip.routeId)!,
            routeId: trip.routeId,
            tripId: trip.id,
            fromStopId: boardingStop.stopId,
            toStopId: alightingStop.stopId,
            departureTime: boardingStop.departureTime,
            arrivalTime: alightingStop.arrivalTime,
            boardingSequence: boardingStop.sequence,
            alightingSequence: alightingStop.sequence,
          }
          const transfer = state.transitBoardings > 0 ? {
            atStopId: state.pendingTransfer?.atStopId ?? state.locationId,
            fromTripId: state.pendingTransfer?.fromTripId ?? state.lastTripId,
            toTripId: trip.id,
            pace: state.pendingTransfer?.pace ?? 'standard' as const,
            readyTime: state.pendingTransfer?.readyTime ?? state.time,
            waitMinutes: boardingStop.departureTime - (state.pendingTransfer?.readyTime ?? state.time),
            walkMinutes: state.pendingTransfer?.walkMinutes ?? 0,
          } : undefined
          boardedStates.push({
            ...state,
            id: `${state.id}/trip:${trip.id}:${alightingStop.stopId}`,
            locationId: alightingStop.stopId,
            time: alightingStop.arrivalTime,
            segments: [...state.segments, segment],
            transfers: transfer ? [...state.transfers, transfer] : state.transfers,
            transitBoardings: state.transitBoardings + 1,
            lastTripId: trip.id,
            continuationKey: `${trip.id}@${alightingIndex}`,
            pendingTransfer: undefined,
          })
        }
      }
      for (const next of mergeEquivalentStates(boardedStates)) this.enqueue(next, frontier, queue)
    }

    return this.toJourneys(this.pareto(arrivals)).slice(0, maxJourneys)
  }

  findHardRouteCandidates(request: Omit<RoutingRequest, 'mode'> & { mode?: 'hard' }): HardRoutingResult {
    return this.hardRouter.search({
      originId: request.originId,
      destinationId: request.destinationId,
      departureTime: request.departureTime,
      maxRouteCandidates: request.maxJourneys,
    })
  }

  private addWalkingLink(link: WalkingLink): void {
    const links = this.walkingFrom.get(link.fromStopId) ?? []
    links.push(link)
    this.walkingFrom.set(link.fromStopId, links)
  }

  private enqueue(state: RoutingState, frontier: Map<string, RoutingState[]>, queue: RoutingState[]): void {
    const atStop = frontier.get(state.locationId) ?? []
    const merged = mergeEquivalentStates([...atStop, state])
    const candidate = merged.find((item) => item.id === state.id || item.mergedAlternativeIds.includes(state.id))
    if (!candidate) return
    if (merged.some((item) => item !== candidate && dominates(criteriaOf(item), criteriaOf(candidate)))) return
    const retained = merged.filter((item) => item === candidate || !dominates(criteriaOf(candidate), criteriaOf(item)))
    frontier.set(state.locationId, retained)
    queue.push(candidate)
  }

  private pareto(states: RoutingState[]): RoutingState[] {
    return states.filter((state, index) => !states.some((other, otherIndex) => otherIndex !== index && dominates(criteriaOf(other), criteriaOf(state))))
      .sort((a, b) => a.time - b.time || a.transitBoardings - b.transitBoardings || a.walkingDistanceMeters - b.walkingDistanceMeters)
  }

  private toJourneys(states: RoutingState[]): Journey[] {
    return states.map((state, index) => ({
      id: `journey-${index + 1}`,
      departureTime: state.segments[0]?.departureTime ?? state.time,
      arrivalTime: state.time,
      segments: state.segments,
      transfers: state.transfers,
      transferCount: Math.max(0, state.transitBoardings - 1),
      walkingDistanceMeters: state.walkingDistanceMeters,
      mergedAlternativeIds: state.mergedAlternativeIds,
    }))
  }
}
