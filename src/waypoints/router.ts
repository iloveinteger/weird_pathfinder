import type { Journey } from '../domain/models'
import type { RoutingMode } from '../routing/mode'
import { TimeDependentRouter } from '../routing/router'
import type { WaypointPlan } from './plan'

export interface MultiStopJourney {
  legs: Journey[]
  departureTime: number
  arrivalTime: number
}

/**
 * Routes ordered legs sequentially. Each waypoint's dwell shifts the next
 * leg's departure, so timetable choices are recalculated instead of appended.
 */
export function routeWaypointPlan(router: TimeDependentRouter, plan: WaypointPlan, mode: RoutingMode): MultiStopJourney | null {
  const ids = [plan.originId, ...plan.waypoints.map((waypoint) => waypoint.placeId), plan.destinationId]
  const legs: Journey[] = []
  let departureTime = plan.departureTime
  for (let index = 0; index < ids.length - 1; index++) {
    const journey = router.findJourneys({
      originId: ids[index], destinationId: ids[index + 1], departureTime, mode, maxJourneys: 1,
    })[0]
    if (!journey) return null
    legs.push(journey)
    departureTime = journey.arrivalTime + (plan.waypoints[index]?.dwellMinutes ?? 0)
  }
  return { legs, departureTime: plan.departureTime, arrivalTime: legs.at(-1)?.arrivalTime ?? plan.departureTime }
}
