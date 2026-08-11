import type { Station, Stop, TransitRoute, TransitTrip } from '../domain/models'
import { parseClock } from '../domain/time'
import type { TransitNetwork } from '../routing/network'

const stop = (id: string, name: string, latitude: number, longitude: number): Stop => ({
  id, kind: 'bus-stop', name, coordinate: { latitude, longitude },
})
const station = (id: string, name: string, lineIds: string[], latitude: number, longitude: number, platformCode?: string): Station => ({
  id, kind: 'station', name, lineIds, coordinate: { latitude, longitude }, platformCode,
})

export const mockPoints = [
  stop('gwanghwamun', '광화문', 37.5716, 126.9769),
  stop('seoul-bus', '서울역버스환승센터', 37.5552, 126.9722),
  station('seoul-platform', '서울역', ['subway-2'], 37.5547, 126.9707, '2'),
  station('jamsil', '잠실역', ['subway-2'], 37.5133, 127.1002, '1'),
]

export const mockRoutes: TransitRoute[] = [
  { id: 'bus-701', name: '701', mode: 'bus', color: '#3471ce', stopIds: ['gwanghwamun', 'seoul-bus'] },
  { id: 'subway-2', name: '2호선 급행(목업)', mode: 'subway', color: '#21a368', stopIds: ['seoul-platform', 'jamsil'] },
]

const trip = (id: string, routeId: string, headsign: string, times: [string, string][], stopIds: string[]): TransitTrip => ({
  id, routeId, headsign, serviceDate: '2026-08-12',
  stops: times.map(([arrival, departure], sequence) => ({
    stopId: stopIds[sequence], arrivalTime: parseClock(arrival), departureTime: parseClock(departure), sequence,
  })),
})

export const mockTrips: TransitTrip[] = [
  trip('bus-701-0900', 'bus-701', '서울역', [['09:00', '09:00'], ['09:10', '09:10']], ['gwanghwamun', 'seoul-bus']),
  trip('subway-fast', 'subway-2', '잠실', [['09:13', '09:13'], ['09:35', '09:35']], ['seoul-platform', 'jamsil']),
  trip('subway-standard', 'subway-2', '잠실', [['09:15', '09:15'], ['09:37', '09:37']], ['seoul-platform', 'jamsil']),
  trip('subway-next', 'subway-2', '잠실', [['09:18', '09:18'], ['09:40', '09:40']], ['seoul-platform', 'jamsil']),
]

export const mockNetwork: TransitNetwork = {
  points: mockPoints,
  routes: mockRoutes,
  trips: mockTrips,
  walkingLinks: [{
    fromStopId: 'seoul-bus',
    toStopId: 'seoul-platform',
    distanceMeters: 320,
    durationMinutes: 4,
    purpose: 'transfer',
  }],
}
