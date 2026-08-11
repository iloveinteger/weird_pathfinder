import type { Journey, JourneySegment, Transfer } from '../../domain/models'
import type { HardRouteCandidate, HardSearchState, TimingVariant } from './types'

export function reconstructJourney(
  terminal: HardSearchState,
  states: ReadonlyMap<string, HardSearchState>,
  departureTime: number,
  variantIndex: number,
): Journey {
  const segments: JourneySegment[] = []
  let cursor: HardSearchState | undefined = terminal
  while (cursor?.predecessor) {
    segments.push(cursor.predecessor.segment)
    cursor = states.get(cursor.predecessor.stateId)
  }
  segments.reverse()
  const transfers: Transfer[] = terminal.transferChoices.map((choice) => ({
    atStopId: choice.atStopId,
    fromTripId: choice.fromTripId,
    toTripId: choice.toTripId,
    pace: choice.pace,
    readyTime: choice.readyTime,
    waitMinutes: choice.vehicleDepartureTime - choice.readyTime,
    walkMinutes: choice.requiredMinutes,
  }))
  return {
    id: `hard-journey-${variantIndex + 1}`,
    departureTime,
    arrivalTime: terminal.time,
    segments,
    transfers,
    transferCount: terminal.transferCount,
    walkingDistanceMeters: terminal.walkingDistanceMeters,
    mergedAlternativeIds: terminal.mergedPredecessors.map((item) => item.stateId),
  }
}

export function groupHardRouteCandidates(
  terminals: HardSearchState[],
  states: ReadonlyMap<string, HardSearchState>,
  departureTime: number,
): HardRouteCandidate[] {
  const grouped = new Map<string, TimingVariant[]>()
  terminals.forEach((terminal, index) => {
    const journey = reconstructJourney(terminal, states, departureTime, index)
    const transitSegments = journey.segments.filter((segment) => segment.type === 'transit')
    const routeIds = transitSegments.map((segment) => segment.routeId)
    const patternKey = routeIds.length ? routeIds.join('>') : 'walk-only'
    const variant: TimingVariant = {
      id: `variant-${index + 1}`,
      arrivalTime: terminal.time,
      standardWalking: terminal.transferChoices.every((choice) => choice.pace === 'standard'),
      tripIds: transitSegments.map((segment) => segment.tripId),
      transferChoices: terminal.transferChoices,
      journey,
    }
    const variants = grouped.get(patternKey) ?? []
    if (!variants.some((item) => sameTimingVariant(item, variant))) variants.push(variant)
    grouped.set(patternKey, variants)
  })

  return [...grouped.entries()].map(([patternKey, timingVariants]) => {
    timingVariants.sort((a, b) => a.arrivalTime - b.arrivalTime || a.journey.transferCount - b.journey.transferCount)
    const best = timingVariants[0]
    return {
      patternKey,
      routeIds: best.journey.segments.filter((segment) => segment.type === 'transit').map((segment) => segment.routeId),
      bestPossibleArrival: best.arrivalTime,
      standardWalkingArrival: timingVariants.find((variant) => variant.standardWalking)?.arrivalTime,
      transferCount: best.journey.transferCount,
      totalWalkMinutes: best.journey.segments.filter((segment) => segment.type === 'walk').reduce((sum, segment) => sum + segment.durationMinutes, 0),
      totalWalkMeters: best.journey.walkingDistanceMeters,
      aggressiveTransferCount: best.transferChoices.filter((choice) => choice.pace === 'fast').length,
      timingVariants,
    }
  }).sort((a, b) => a.bestPossibleArrival - b.bestPossibleArrival
    || a.transferCount - b.transferCount
    || a.totalWalkMeters - b.totalWalkMeters)
}

function sameTimingVariant(a: TimingVariant, b: TimingVariant): boolean {
  return a.arrivalTime === b.arrivalTime
    && a.tripIds.join('|') === b.tripIds.join('|')
    && a.transferChoices.map((choice) => choice.pace).join('|') === b.transferChoices.map((choice) => choice.pace).join('|')
}
