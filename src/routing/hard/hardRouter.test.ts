import { describe, expect, it } from 'vitest'
import type { Stop, TransitRoute, TransitTrip } from '../../domain/models'
import { parseClock } from '../../domain/time'
import { mockNetwork } from '../../mock/network'
import type { TransitNetwork } from '../network'
import { TimeDependentRouter } from '../router'
import { HardRouter } from './hardRouter'
import { hardDominates, insertHardPareto } from './pareto'
import type { HardSearchState } from './types'

const point = (id: string, longitude = 126): Stop => ({
  id, kind: 'bus-stop', name: id, coordinate: { latitude: 37, longitude },
})
const route = (id: string, stopIds: string[]): TransitRoute => ({
  id, name: id, mode: 'bus', color: '#000', stopIds,
})
const trip = (id: string, routeId: string, stopIds: string[], times: number[]): TransitTrip => ({
  id, routeId, headsign: stopIds.at(-1)!, serviceDate: '2026-08-12',
  stops: stopIds.map((stopId, sequence) => ({ stopId, sequence, arrivalTime: times[sequence], departureTime: times[sequence] })),
})
const network = (
  stopIds: string[],
  routes: TransitRoute[],
  trips: TransitTrip[],
  walkingLinks: TransitNetwork['walkingLinks'] = [],
): TransitNetwork => ({ points: stopIds.map((id, index) => point(id, 126 + index * 0.001)), routes, trips, walkingLinks })

describe('Hard time-dependent routing', () => {
  it('catches one vehicle earlier with a fast transfer', () => {
    const router = new TimeDependentRouter(mockNetwork)
    const normal = router.findJourneys({ originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: parseClock('09:00'), mode: 'normal' })
    const hard = router.findHardRouteCandidates({ originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: parseClock('09:00') })
    expect(hard.candidates[0].bestPossibleArrival).toBe(parseClock('09:35'))
    expect(hard.candidates[0].standardWalkingArrival).toBe(parseClock('09:37'))
    expect(normal[0].arrivalTime).toBe(parseClock('09:37'))
  })

  it('lets the first fast transfer change the second connection too', () => {
    const routes = [route('feed', ['O', 'X']), route('first', ['P1', 'Y']), route('last', ['P2', 'D'])]
    const trips = [
      trip('feed-1', 'feed', ['O', 'X'], [0, 10]),
      trip('first-ahead', 'first', ['P1', 'Y'], [13, 20]),
      trip('first-standard', 'first', ['P1', 'Y'], [15, 24]),
      trip('last-ahead', 'last', ['P2', 'D'], [23, 30]),
      trip('last-next', 'last', ['P2', 'D'], [28, 40]),
    ]
    const hard = new HardRouter(network(['O', 'X', 'P1', 'Y', 'P2', 'D'], routes, trips, [
      { fromStopId: 'X', toStopId: 'P1', distanceMeters: 300, durationMinutes: 4, purpose: 'transfer' },
      { fromStopId: 'Y', toStopId: 'P2', distanceMeters: 300, durationMinutes: 4, purpose: 'transfer' },
    ])).search({ originId: 'O', destinationId: 'D', departureTime: 0 })
    const best = hard.candidates[0].timingVariants[0]
    expect(best.tripIds).toEqual(['feed-1', 'first-ahead', 'last-ahead'])
    expect(best.arrivalTime).toBe(30)
    expect(hard.candidates[0].standardWalkingArrival).toBe(40)
  })

  it('finds a faster path that temporarily travels in the opposite direction', () => {
    const routes = [route('direct', ['O', 'D']), route('outbound', ['O', 'X']), route('express-back', ['X', 'D'])]
    const trips = [
      trip('direct-slow', 'direct', ['O', 'D'], [0, 100]),
      trip('wrong-way', 'outbound', ['O', 'X'], [1, 5]),
      trip('back-fast', 'express-back', ['X', 'D'], [6, 20]),
    ]
    const router = new TimeDependentRouter(network(['O', 'D', 'X'], routes, trips))
    expect(router.findJourneys({ originId: 'O', destinationId: 'D', departureTime: 0, mode: 'hard' })[0].arrivalTime).toBe(20)
  })

  it('uses a long walking transfer when it wins on arrival time', () => {
    const routes = [route('direct', ['O', 'D']), route('express', ['X', 'D'])]
    const trips = [trip('slow', 'direct', ['O', 'D'], [0, 100]), trip('express-1', 'express', ['X', 'D'], [31, 50])]
    const net = network(['O', 'X', 'D'], routes, trips, [
      { fromStopId: 'O', toStopId: 'X', distanceMeters: 3_000, durationMinutes: 30, purpose: 'access' },
    ])
    const router = new TimeDependentRouter(net)
    expect(router.findJourneys({ originId: 'O', destinationId: 'D', departureTime: 0, mode: 'hard' })[0].arrivalTime).toBe(50)
    expect(router.findJourneys({ originId: 'O', destinationId: 'D', departureTime: 0, mode: 'normal' })[0].arrivalTime).toBe(100)
  })

  it('keeps a faster path even when it has more transfers', () => {
    const routes = [
      route('direct', ['O', 'D']), route('r1', ['O', 'A']), route('r2', ['A', 'B']), route('r3', ['B', 'D']),
    ]
    const trips = [
      trip('direct-1', 'direct', ['O', 'D'], [0, 100]),
      trip('r1-1', 'r1', ['O', 'A'], [1, 10]), trip('r2-1', 'r2', ['A', 'B'], [11, 20]), trip('r3-1', 'r3', ['B', 'D'], [21, 30]),
    ]
    const result = new HardRouter(network(['O', 'A', 'B', 'D'], routes, trips)).search({ originId: 'O', destinationId: 'D', departureTime: 0 })
    expect(result.candidates[0].bestPossibleArrival).toBe(30)
    expect(result.candidates[0].transferCount).toBe(2)
  })

  it('Normal drops the abnormal detour while Hard keeps it', () => {
    const routes = [route('direct', ['O', 'D']), route('detour', ['O', 'X']), route('return', ['X', 'D'])]
    const trips = [
      trip('direct', 'direct', ['O', 'D'], [0, 90]),
      trip('detour', 'detour', ['O', 'X'], [1, 5]),
      trip('return', 'return', ['X', 'D'], [6, 20]),
    ]
    const router = new TimeDependentRouter(network(['O', 'D', 'X'], routes, trips))
    expect(router.findJourneys({ originId: 'O', destinationId: 'D', departureTime: 0, mode: 'normal' })[0].arrivalTime).toBe(90)
    expect(router.findJourneys({ originId: 'O', destinationId: 'D', departureTime: 0, mode: 'hard' })[0].arrivalTime).toBe(20)
  })

  it('keeps multiple timing variants for the same route pattern', () => {
    const result = new HardRouter(mockNetwork).search({
      originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: parseClock('09:00'),
    })
    const candidate = result.candidates.find((item) => item.patternKey === 'bus-701>subway-2')!
    expect(candidate.timingVariants.length).toBeGreaterThanOrEqual(2)
    expect(candidate.timingVariants.map((item) => item.arrivalTime)).toEqual(expect.arrayContaining([
      parseClock('09:35'), parseClock('09:37'),
    ]))
  })
})

const hardState = (overrides: Partial<HardSearchState> = {}): HardSearchState => ({
  id: 'state', locationId: 'S', time: 10, currentRouteId: 'route', currentTripId: 'trip',
  transferCount: 1, transitBoardings: 2, walkingMinutes: 5, walkingDistanceMeters: 300,
  aggressiveTransferCount: 0, aggressiveMinutesSaved: 0, transferChoices: [], routePattern: ['route'],
  mergedPredecessors: [], ...overrides,
})

describe('Hard Pareto frontier and merging', () => {
  it('retains two non-dominated states', () => {
    const earlierWithMoreWalking = hardState({ id: 'a', time: 10, walkingMinutes: 8, walkingDistanceMeters: 500 })
    const laterWithLessWalking = hardState({ id: 'b', time: 12, walkingMinutes: 4, walkingDistanceMeters: 200 })
    const inserted = insertHardPareto([earlierWithMoreWalking], laterWithLessWalking)
    expect(inserted.frontier).toHaveLength(2)
    expect(hardDominates(
      { time: 10, transferCount: 1, walkingMinutes: 8, walkingDistanceMeters: 500, aggressiveTransferCount: 0, aggressiveMinutesSaved: 0 },
      { time: 12, transferCount: 1, walkingMinutes: 4, walkingDistanceMeters: 200, aggressiveTransferCount: 0, aggressiveMinutesSaved: 0 },
    )).toBe(false)
  })

  it('removes only a completely dominated state', () => {
    const better = hardState({ id: 'better', time: 10, walkingMinutes: 4, walkingDistanceMeters: 200 })
    const worse = hardState({ id: 'worse', time: 12, transferCount: 2, walkingMinutes: 5, walkingDistanceMeters: 300, aggressiveTransferCount: 1, aggressiveMinutesSaved: 2 })
    const inserted = insertHardPareto([better], worse)
    expect(inserted.dominated).toBe(true)
    expect(inserted.frontier).toEqual([better])
  })

  it('merges branches only after their vehicle context and resource vector match', () => {
    const predecessorA = { stateId: 'branch-a', segment: { type: 'transit' as const, mode: 'subway' as const, routeId: 'route', tripId: 'same-car', fromStopId: 'A', toStopId: 'S', departureTime: 5, arrivalTime: 10, boardingSequence: 0, alightingSequence: 1 } }
    const predecessorB = { ...predecessorA, stateId: 'branch-b' }
    const a = hardState({ id: 'a', currentTripId: 'same-car', predecessor: predecessorA })
    const b = hardState({ id: 'b', currentTripId: 'same-car', predecessor: predecessorB })
    const merged = insertHardPareto([a], b)
    expect(merged.merged).toBe(true)
    expect(merged.frontier).toHaveLength(1)
    expect(merged.frontier[0].mergedPredecessors.map((item) => item.stateId)).toContain('branch-b')

    const differentVehicle = hardState({ id: 'c', currentTripId: 'other-car', predecessor: predecessorB })
    expect(insertHardPareto([a], differentVehicle).merged).toBe(false)
  })
})
