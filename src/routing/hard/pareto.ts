import type { HardParetoVector, HardSearchState } from './types'

export function hardVectorOf(state: HardSearchState): HardParetoVector {
  return {
    time: state.time,
    transferCount: state.transferCount,
    walkingMinutes: state.walkingMinutes,
    walkingDistanceMeters: state.walkingDistanceMeters,
    aggressiveTransferCount: state.aggressiveTransferCount,
    aggressiveMinutesSaved: state.aggressiveMinutesSaved,
  }
}

/** Component-wise dominance. No scalar score is used. */
export function hardDominates(a: HardParetoVector, b: HardParetoVector): boolean {
  const noWorse = a.time <= b.time
    && a.transferCount <= b.transferCount
    && a.walkingMinutes <= b.walkingMinutes
    && a.walkingDistanceMeters <= b.walkingDistanceMeters
    && a.aggressiveTransferCount <= b.aggressiveTransferCount
    && a.aggressiveMinutesSaved <= b.aggressiveMinutesSaved
  const strictlyBetter = a.time < b.time
    || a.transferCount < b.transferCount
    || a.walkingMinutes < b.walkingMinutes
    || a.walkingDistanceMeters < b.walkingDistanceMeters
    || a.aggressiveTransferCount < b.aggressiveTransferCount
    || a.aggressiveMinutesSaved < b.aggressiveMinutesSaved
  return noWorse && strictlyBetter
}

/**
 * Vehicle context and an uncommitted transfer pace are part of the state
 * signature. Merely reaching the same stop is insufficient because transfer
 * accounting, result metadata, and continuation differ.
 */
export function hardStateSignature(state: HardSearchState): string {
  return `${state.locationId}|${state.currentRouteId ?? '-'}|${state.currentTripId ?? '-'}|${state.pendingTransfer?.pace ?? '-'}`
}

export function equivalentFutureState(a: HardSearchState, b: HardSearchState): boolean {
  return hardStateSignature(a) === hardStateSignature(b)
    && a.time === b.time
    && a.transferCount === b.transferCount
    && a.walkingMinutes === b.walkingMinutes
    && a.walkingDistanceMeters === b.walkingDistanceMeters
    && a.aggressiveTransferCount === b.aggressiveTransferCount
    && a.aggressiveMinutesSaved === b.aggressiveMinutesSaved
}

export interface ParetoInsertResult {
  frontier: HardSearchState[]
  accepted?: HardSearchState
  dominated: boolean
  merged: boolean
}

export function insertHardPareto(frontier: HardSearchState[], candidate: HardSearchState): ParetoInsertResult {
  const equivalent = frontier.find((state) => equivalentFutureState(state, candidate))
  if (equivalent) {
    const predecessor = candidate.predecessor
    const mergedPredecessors = predecessor
      ? [...equivalent.mergedPredecessors, predecessor, ...candidate.mergedPredecessors]
      : [...equivalent.mergedPredecessors, ...candidate.mergedPredecessors]
    const merged = { ...equivalent, mergedPredecessors: uniquePredecessors(mergedPredecessors) }
    return {
      frontier: frontier.map((state) => state === equivalent ? merged : state),
      accepted: merged,
      dominated: false,
      merged: true,
    }
  }

  if (frontier.some((state) => hardDominates(hardVectorOf(state), hardVectorOf(candidate)))) {
    return { frontier, dominated: true, merged: false }
  }

  return {
    frontier: [...frontier.filter((state) => !hardDominates(hardVectorOf(candidate), hardVectorOf(state))), candidate],
    accepted: candidate,
    dominated: false,
    merged: false,
  }
}

function uniquePredecessors(predecessors: HardSearchState['mergedPredecessors']): HardSearchState['mergedPredecessors'] {
  const seen = new Set<string>()
  return predecessors.filter((item) => {
    const key = `${item.stateId}|${item.segment.type}|${item.segment.fromStopId}|${item.segment.toStopId}|${item.segment.arrivalTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
