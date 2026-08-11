import type { Stop, TransitRoute, TransitTrip } from '../domain/models'
import type { TransitNetwork } from '../routing/network'

/** Deterministic medium-size network used for diagnostics, never production data. */
export function createSyntheticNetwork(stopCount = 24, departuresPerRoute = 5): TransitNetwork {
  if (stopCount < 6) throw new Error('Synthetic network needs at least 6 stops')
  const stopIds = Array.from({ length: stopCount }, (_, index) => `synthetic-${index}`)
  const points: Stop[] = stopIds.map((id, index) => ({
    id,
    kind: 'bus-stop',
    name: `Synthetic ${index}`,
    coordinate: { latitude: 37 + index * 0.001, longitude: 127 },
  }))
  const expressStops = stopIds.filter((_, index) => index % 4 === 0 || index === stopCount - 1)
  const routes: TransitRoute[] = [
    { id: 'synthetic-local', name: 'Synthetic local', mode: 'bus', color: '#3471ce', stopIds },
    { id: 'synthetic-express', name: 'Synthetic express', mode: 'subway', color: '#21a368', stopIds: expressStops },
    { id: 'synthetic-reverse', name: 'Synthetic reverse', mode: 'bus', color: '#db4b28', stopIds: [...stopIds].reverse() },
  ]
  const trips: TransitTrip[] = []
  for (let departure = 0; departure < departuresPerRoute; departure++) {
    const localStart = departure * 8
    trips.push(makeTrip(`local-${departure}`, routes[0].id, stopIds, localStart, 3))
    trips.push(makeTrip(`express-${departure}`, routes[1].id, expressStops, localStart + 2, 6))
    trips.push(makeTrip(`reverse-${departure}`, routes[2].id, [...stopIds].reverse(), localStart, 3))
  }
  const walkingLinks = stopIds.slice(0, -1).map((fromStopId, index) => ({
    fromStopId,
    toStopId: stopIds[index + 1],
    distanceMeters: 260,
    durationMinutes: 4,
    purpose: 'transfer' as const,
    bidirectional: true,
  }))
  return { points, routes, trips, walkingLinks }
}

function makeTrip(id: string, routeId: string, stopIds: string[], start: number, minutesPerStop: number): TransitTrip {
  return {
    id,
    routeId,
    headsign: stopIds.at(-1)!,
    serviceDate: '2026-08-12',
    stops: stopIds.map((stopId, sequence) => ({
      stopId,
      sequence,
      arrivalTime: start + sequence * minutesPerStop,
      departureTime: start + sequence * minutesPerStop,
    })),
  }
}
