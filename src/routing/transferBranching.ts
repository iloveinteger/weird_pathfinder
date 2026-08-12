import type { WalkSegment } from '../domain/models'
import type { WalkingLink } from './network'
import type { RoutingPolicy } from './mode'
import type { RoutingState } from './state'

export function branchAcrossWalkingLink(
  state: RoutingState,
  link: WalkingLink,
  policy: RoutingPolicy,
): RoutingState[] {
  if (state.walkingDistanceMeters + link.distanceMeters > policy.maxWalkingMeters) return []

  // Hard mode only branches transfer movement. Access/egress walking remains
  // at the provider's normal duration instead of receiving a global speed-up.
  const profiles = link.purpose === 'transfer'
    ? policy.transferProfiles
    : [{ pace: 'standard' as const, durationMultiplier: 1 }]

  return profiles.map((profile) => {
    const durationMinutes = Math.max(1, Math.ceil(link.durationMinutes * profile.durationMultiplier))
    const segment: WalkSegment = {
      type: 'walk',
      fromStopId: link.fromStopId,
      toStopId: link.toStopId,
      departureTime: state.time,
      arrivalTime: state.time + durationMinutes,
      durationMinutes,
      distanceMeters: link.distanceMeters,
      purpose: link.purpose,
      pace: profile.pace,
      path: link.path,
    }
    return {
      ...state,
      id: `${state.id}/walk:${link.toStopId}:${profile.pace}`,
      locationId: link.toStopId,
      time: segment.arrivalTime,
      segments: [...state.segments, segment],
      walkingDistanceMeters: state.walkingDistanceMeters + link.distanceMeters,
      continuationKey: undefined,
      pendingTransfer: link.purpose === 'transfer' ? {
        atStopId: link.toStopId,
        fromTripId: state.lastTripId,
        pace: profile.pace,
        readyTime: segment.arrivalTime,
        walkMinutes: durationMinutes,
      } : state.pendingTransfer,
    }
  })
}
