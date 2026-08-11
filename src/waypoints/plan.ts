import type { Minutes, StopId, Waypoint } from '../domain/models'

export interface WaypointPlan {
  originId: StopId
  destinationId: StopId
  departureTime: Minutes
  waypoints: Waypoint[]
}

export function addWaypoint(plan: WaypointPlan, waypoint: Waypoint, index = plan.waypoints.length): WaypointPlan {
  const waypoints = [...plan.waypoints]
  waypoints.splice(Math.max(0, Math.min(index, waypoints.length)), 0, waypoint)
  return { ...plan, waypoints }
}

export function removeWaypoint(plan: WaypointPlan, waypointId: string): WaypointPlan {
  return { ...plan, waypoints: plan.waypoints.filter((waypoint) => waypoint.id !== waypointId) }
}

export function moveWaypoint(plan: WaypointPlan, waypointId: string, targetIndex: number): WaypointPlan {
  const sourceIndex = plan.waypoints.findIndex((waypoint) => waypoint.id === waypointId)
  if (sourceIndex < 0) return plan
  const waypoints = [...plan.waypoints]
  const [waypoint] = waypoints.splice(sourceIndex, 1)
  waypoints.splice(Math.max(0, Math.min(targetIndex, waypoints.length)), 0, waypoint)
  return { ...plan, waypoints }
}

export interface ResolvedWaypointTiming {
  arrivalTime: Minutes
  departureTime: Minutes
  dwellMinutes: Minutes
}

export type WaypointTimingInput =
  | { arrivalTime: Minutes; dwellMinutes: Minutes }
  | { arrivalTime: Minutes; departureTime: Minutes }

/** Converts either editable dwell time or editable departure time to both forms. */
export function resolveWaypointTiming(input: WaypointTimingInput): ResolvedWaypointTiming {
  if ('dwellMinutes' in input) {
    if (input.dwellMinutes < 0) throw new Error('Dwell time cannot be negative')
    return { ...input, departureTime: input.arrivalTime + input.dwellMinutes }
  }
  if (input.departureTime < input.arrivalTime) throw new Error('Departure cannot be before arrival')
  return { ...input, dwellMinutes: input.departureTime - input.arrivalTime }
}

export interface PlannedLegTiming {
  fromId: StopId
  toId: StopId
  departureTime: Minutes
  arrivalTime: Minutes
}

/** Propagates a departure time through each leg and waypoint dwell. */
export function buildLegTimings(plan: WaypointPlan, legDurations: Minutes[]): PlannedLegTiming[] {
  const pointIds = [plan.originId, ...plan.waypoints.map((waypoint) => waypoint.placeId), plan.destinationId]
  if (legDurations.length !== pointIds.length - 1) throw new Error('A duration is required for every leg')
  const legs: PlannedLegTiming[] = []
  let departureTime = plan.departureTime
  for (let index = 0; index < legDurations.length; index++) {
    const arrivalTime = departureTime + legDurations[index]
    legs.push({ fromId: pointIds[index], toId: pointIds[index + 1], departureTime, arrivalTime })
    departureTime = arrivalTime + (plan.waypoints[index]?.dwellMinutes ?? 0)
  }
  return legs
}
