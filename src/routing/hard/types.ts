import type {
  Journey,
  JourneySegment,
  RouteId,
  StopId,
  TransferPace,
  TripId,
} from '../../domain/models'

export interface AggressiveTransferChoice {
  id: string
  atStopId: StopId
  fromTripId?: TripId
  toTripId: TripId
  pace: TransferPace
  requiredMinutes: number
  standardMinutes: number
  readyTime: number
  vehicleDepartureTime: number
  vehicleArrivalTime: number
}

export interface HardPredecessor {
  stateId: string
  segment: JourneySegment
}

export interface PendingHardTransfer {
  atStopId: StopId
  fromTripId?: TripId
  pace: TransferPace
  requiredMinutes: number
  standardMinutes: number
  readyTime: number
}

/** A label in the time-dependent Hard search. */
export interface HardSearchState {
  id: string
  locationId: StopId
  time: number
  currentRouteId?: RouteId
  currentTripId?: TripId
  transferCount: number
  transitBoardings: number
  walkingMinutes: number
  walkingDistanceMeters: number
  aggressiveTransferCount: number
  aggressiveMinutesSaved: number
  transferChoices: AggressiveTransferChoice[]
  routePattern: RouteId[]
  pendingTransfer?: PendingHardTransfer
  predecessor?: HardPredecessor
  /** Equal-cost histories folded into this operational state. */
  mergedPredecessors: HardPredecessor[]
}

export interface HardParetoVector {
  time: number
  transferCount: number
  walkingMinutes: number
  walkingDistanceMeters: number
  aggressiveTransferCount: number
  aggressiveMinutesSaved: number
}

export interface TimingVariant {
  id: string
  arrivalTime: number
  standardWalking: boolean
  tripIds: TripId[]
  transferChoices: AggressiveTransferChoice[]
  journey: Journey
}

export interface HardRouteCandidate {
  patternKey: string
  routeIds: RouteId[]
  bestPossibleArrival: number
  standardWalkingArrival?: number
  transferCount: number
  totalWalkMinutes: number
  totalWalkMeters: number
  aggressiveTransferCount: number
  timingVariants: TimingVariant[]
}

export interface HardSearchDiagnostics {
  generatedStates: number
  expandedStates: number
  dominatedStates: number
  mergedStates: number
  boundPrunedStates: number
  maxQueueSize: number
  elapsedMilliseconds: number
}

export interface HardRoutingResult {
  candidates: HardRouteCandidate[]
  diagnostics: HardSearchDiagnostics
}
