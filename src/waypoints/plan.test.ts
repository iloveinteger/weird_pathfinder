import { describe, expect, it } from 'vitest'
import type { Waypoint } from '../domain/models'
import { addWaypoint, buildLegTimings, moveWaypoint, removeWaypoint, resolveWaypointTiming, type WaypointPlan } from './plan'

const a: Waypoint = { id: 'a', placeId: 'seoul', name: '서울역', dwellMinutes: 10 }
const b: Waypoint = { id: 'b', placeId: 'city-hall', name: '시청', dwellMinutes: 5 }
const base: WaypointPlan = { originId: 'origin', destinationId: 'destination', departureTime: 540, waypoints: [] }

describe('waypoint plan', () => {
  it('adds, reorders and removes waypoints immutably', () => {
    const withTwo = addWaypoint(addWaypoint(base, a), b)
    const moved = moveWaypoint(withTwo, 'b', 0)
    const removed = removeWaypoint(moved, 'a')
    expect(base.waypoints).toEqual([])
    expect(moved.waypoints.map((waypoint) => waypoint.id)).toEqual(['b', 'a'])
    expect(removed.waypoints.map((waypoint) => waypoint.id)).toEqual(['b'])
  })

  it('converts dwell and departure time in both directions', () => {
    expect(resolveWaypointTiming({ arrivalTime: 600, dwellMinutes: 15 })).toEqual({ arrivalTime: 600, departureTime: 615, dwellMinutes: 15 })
    expect(resolveWaypointTiming({ arrivalTime: 600, departureTime: 625 })).toEqual({ arrivalTime: 600, departureTime: 625, dwellMinutes: 25 })
  })

  it('shifts the next leg departure by each waypoint dwell', () => {
    const plan = { ...base, waypoints: [a, b] }
    expect(buildLegTimings(plan, [20, 30, 40])).toEqual([
      { fromId: 'origin', toId: 'seoul', departureTime: 540, arrivalTime: 560 },
      { fromId: 'seoul', toId: 'city-hall', departureTime: 570, arrivalTime: 600 },
      { fromId: 'city-hall', toId: 'destination', departureTime: 605, arrivalTime: 645 },
    ])
  })
})
