import { describe, expect, it } from 'vitest'
import { parseClock } from '../domain/time'
import { mockNetwork } from '../mock/network'
import { ROUTING_POLICIES } from './mode'
import { TimeDependentRouter } from './router'
import { dominates, mergeEquivalentStates, type RoutingState } from './state'
import { branchAcrossWalkingLink } from './transferBranching'

const initialState: RoutingState = {
  id: 'arrived-by-bus',
  locationId: 'seoul-bus',
  time: parseClock('09:10'),
  segments: [],
  transfers: [],
  walkingDistanceMeters: 0,
  transitBoardings: 1,
  lastTripId: 'bus-701-0900',
  mergedAlternativeIds: [],
}

describe('transfer timing branches', () => {
  it('branches only a Hard transfer into fast, standard and relaxed arrival times', () => {
    const branches = branchAcrossWalkingLink(initialState, mockNetwork.walkingLinks[0], ROUTING_POLICIES.hard)
    expect(branches.map((branch) => branch.pendingTransfer?.pace)).toEqual(['fast', 'standard', 'relaxed'])
    expect(branches.map((branch) => branch.time)).toEqual([
      parseClock('09:13'), parseClock('09:14'), parseClock('09:16'),
    ])
  })

  it('does not globally accelerate access walking in Hard mode', () => {
    const access = { ...mockNetwork.walkingLinks[0], purpose: 'access' as const }
    const branches = branchAcrossWalkingLink(initialState, access, ROUTING_POLICIES.hard)
    expect(branches).toHaveLength(1)
    expect(branches[0].time).toBe(parseClock('09:14'))
  })
})

describe('time-dependent router', () => {
  const router = new TimeDependentRouter(mockNetwork)

  it('lets Hard mode catch the earlier vehicle at a fast transfer', () => {
    const normal = router.findJourneys({ originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: parseClock('09:00'), mode: 'normal' })
    const hard = router.findJourneys({ originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: parseClock('09:00'), mode: 'hard' })
    expect(normal[0].arrivalTime).toBe(parseClock('09:37'))
    expect(hard[0].arrivalTime).toBe(parseClock('09:35'))
    expect(hard[0].transfers[0].pace).toBe('fast')
  })

  it('sorts viable journeys by arrival time', () => {
    const journeys = router.findJourneys({ originId: 'seoul-platform', destinationId: 'jamsil', departureTime: parseClock('09:12'), mode: 'hard' })
    expect(journeys.map((journey) => journey.arrivalTime)).toEqual([...journeys.map((journey) => journey.arrivalTime)].sort((a, b) => a - b))
  })
})

describe('state pruning and merging', () => {
  it('only reports strict Pareto dominance', () => {
    expect(dominates(
      { arrivalTime: 10, transferCount: 1, walkingDistanceMeters: 200 },
      { arrivalTime: 11, transferCount: 1, walkingDistanceMeters: 200 },
    )).toBe(true)
    expect(dominates(
      { arrivalTime: 10, transferCount: 2, walkingDistanceMeters: 200 },
      { arrivalTime: 11, transferCount: 1, walkingDistanceMeters: 200 },
    )).toBe(false)
  })

  it('merges timing branches after they board the same vehicle', () => {
    const a = { ...initialState, id: 'fast-branch', locationId: 'jamsil', time: 575, continuationKey: 'subway-fast@1' }
    const b = { ...initialState, id: 'standard-branch', locationId: 'jamsil', time: 575, continuationKey: 'subway-fast@1' }
    const merged = mergeEquivalentStates([a, b])
    expect(merged).toHaveLength(1)
    expect(merged[0].mergedAlternativeIds).toEqual(expect.arrayContaining(['fast-branch', 'standard-branch']))
  })
})
