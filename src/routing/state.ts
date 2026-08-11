import type { JourneySegment, StopId, Transfer, TransferPace, TripId } from '../domain/models'

export interface PendingTransfer {
  atStopId: StopId
  fromTripId?: TripId
  pace: TransferPace
  readyTime: number
  walkMinutes: number
}

export interface RoutingState {
  id: string
  locationId: StopId
  time: number
  segments: JourneySegment[]
  transfers: Transfer[]
  walkingDistanceMeters: number
  transitBoardings: number
  lastTripId?: TripId
  continuationKey?: string
  pendingTransfer?: PendingTransfer
  mergedAlternativeIds: string[]
}

export interface ParetoCriteria {
  arrivalTime: number
  transferCount: number
  walkingDistanceMeters: number
}

export function criteriaOf(state: RoutingState): ParetoCriteria {
  return {
    arrivalTime: state.time,
    transferCount: Math.max(0, state.transitBoardings - 1),
    walkingDistanceMeters: state.walkingDistanceMeters,
  }
}

export function dominates(a: ParetoCriteria, b: ParetoCriteria): boolean {
  const noWorse = a.arrivalTime <= b.arrivalTime
    && a.transferCount <= b.transferCount
    && a.walkingDistanceMeters <= b.walkingDistanceMeters
  const strictlyBetter = a.arrivalTime < b.arrivalTime
    || a.transferCount < b.transferCount
    || a.walkingDistanceMeters < b.walkingDistanceMeters
  return noWorse && strictlyBetter
}

/**
 * States that have reached the same stop on the same physical vehicle are
 * operationally identical from this point onward. Keep one continuation while
 * retaining the IDs of all timing branches for explanation/debugging.
 */
export function mergeEquivalentStates(states: RoutingState[]): RoutingState[] {
  const merged = new Map<string, RoutingState>()
  const unmergeable: RoutingState[] = []

  for (const state of states) {
    if (!state.continuationKey) {
      unmergeable.push(state)
      continue
    }
    const key = `${state.locationId}|${state.time}|${state.continuationKey}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, state)
      continue
    }
    const preferred = state.walkingDistanceMeters < current.walkingDistanceMeters ? state : current
    const other = preferred === state ? current : state
    merged.set(key, {
      ...preferred,
      mergedAlternativeIds: Array.from(new Set([
        ...preferred.mergedAlternativeIds,
        preferred.id,
        ...other.mergedAlternativeIds,
        other.id,
      ])),
    })
  }

  return [...unmergeable, ...merged.values()]
}
