import type { TransferPace } from '../domain/models'

export type RoutingMode = 'normal' | 'hard'

export interface TransferProfile {
  pace: TransferPace
  durationMultiplier: number
}

export interface RoutingPolicy {
  mode: RoutingMode
  transferProfiles: TransferProfile[]
  maxTransfers: number
  maxWalkingMeters: number
  maxAccessEgressMeters: number
  maxTransferWalkingMeters: number
  maxBoardingOptions: number
  allowOppositeDirection: boolean
  allowStationReentry: boolean
  pruneByHeuristics: boolean
}

export const ROUTING_POLICIES: Record<RoutingMode, RoutingPolicy> = {
  normal: {
    mode: 'normal',
    transferProfiles: [{ pace: 'standard', durationMultiplier: 1 }],
    maxTransfers: 3,
    maxWalkingMeters: 5_000,
    maxAccessEgressMeters: 2_000,
    maxTransferWalkingMeters: 2_000,
    maxBoardingOptions: 3,
    allowOppositeDirection: false,
    allowStationReentry: false,
    pruneByHeuristics: true,
  },
  hard: {
    mode: 'hard',
    transferProfiles: [
      { pace: 'fast', durationMultiplier: 0.7 },
      { pace: 'standard', durationMultiplier: 1 },
      { pace: 'relaxed', durationMultiplier: 1.5 },
    ],
    maxTransfers: 8,
    maxWalkingMeters: 5_000,
    maxAccessEgressMeters: 5_000,
    maxTransferWalkingMeters: 5_000,
    maxBoardingOptions: 3,
    allowOppositeDirection: true,
    allowStationReentry: true,
    pruneByHeuristics: false,
  },
}
