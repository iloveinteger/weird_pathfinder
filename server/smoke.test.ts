import { describe, expect, it } from 'vitest'
import { TimeDependentRouter } from '../src/routing/router'
import { ServiceError } from './errors'
import { UpstreamProviders } from './providers'

const required = ['KAKAO_REST_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'SEOUL_OPEN_API_KEY', 'SEOUL_SUBWAY_REALTIME_API_KEY'] as const
const enabled = required.every((name) => Boolean(process.env[name]))
const smoke = enabled ? it : it.skip
const providers = new UpstreamProviders(process.env)

describe('real provider smoke', () => {
  smoke('1-3 Kakao place, coordinate and walking', async () => {
    const origin = (await providers.searchPlaces('서울역'))[0]; const destination = (await providers.searchPlaces('시청역'))[0]
    expect(origin?.coordinate).toBeTruthy(); expect(destination?.coordinate).toBeTruthy()
    expect(await providers.reverseGeocode(origin.coordinate)).toBeTruthy()
    expect((await providers.walking(origin.coordinate, destination.coordinate)).path.length).toBeGreaterThan(1)
  }, 20_000)

  smoke('4 TAGO bus stops', async ({ skip }) => {
    try {
      const stops = await providers.busStops({ latitude: 36.3, longitude: 127.3 })
      expect(stops.length).toBeGreaterThan(0)
    } catch (error) {
      if (isTagoAccessUnavailable(error)) skip('The TAGO bus stop service is unreachable from this runner')
      throw error
    }
  }, 20_000)

  smoke('5 TAGO bus routes', async ({ skip }) => {
    try {
      const routes = await providers.busRoutes('25', '5')
      expect(routes.length).toBeGreaterThan(0)
    } catch (error) {
      if (isTagoAccessUnavailable(error)) skip('The TAGO bus route service is unreachable from this runner')
      throw error
    }
  }, 20_000)

  smoke('6 TAGO bus arrivals', async ({ skip }) => {
    try {
      expect(await providers.busArrivals('25', 'DJB8002011')).toBeInstanceOf(Array)
    } catch (error) {
      if (isTagoAccessUnavailable(error)) skip('The TAGO bus arrival service is unreachable or not approved')
      throw error
    }
  }, 20_000)

  smoke('7 TAGO subway information', async ({ skip }) => {
    try {
      const stations = await providers.subwayStations('서울역')
      expect(stations.length).toBeGreaterThan(0)
      expect(stations[0].kind).toBe('station')
      if (stations[0].kind !== 'station') throw new Error('TAGO subway response was not normalized as a station')
      expect(stations[0].lineIds.length).toBeGreaterThan(0)
      const serviceDate = new Date().toISOString().slice(0, 10)
      const downTrips = await providers.subwayTimetable('MTRS11133', serviceDate, '01', 'D')
      const upTrips = downTrips.length ? [] : await providers.subwayTimetable('MTRS11133', serviceDate, '01', 'U')
      const trips = downTrips.length ? downTrips : upTrips
      expect(trips.length).toBeGreaterThan(0)
    } catch (error) {
      if (isTagoAccessUnavailable(error)) skip('The TAGO gateway is unreachable or the key is not approved for subway information')
      throw error
    }
  }, 20_000)

  smoke('8 Seoul subway realtime', async () => {
    expect(await providers.subwayRealtime('서울', '서울')).toBeInstanceOf(Array)
  }, 20_000)

  smoke('Seoul Open API key and station endpoint', async () => {
    expect(await providers.seoulStations('서울역')).toBeTruthy()
  }, 20_000)

  smoke('real routing pipeline: Seoul Station, waypoint and Gangnam', async () => {
    const origin = (await providers.searchPlaces('서울역')).find((place) => place.name.includes('서울역'))
    const waypoint = (await providers.searchPlaces('시청역')).find((place) => place.name.includes('시청역'))
    const destination = (await providers.searchPlaces('강남역')).find((place) => place.name.includes('강남역'))
    expect(origin?.coordinate).toBeTruthy(); expect(waypoint?.coordinate).toBeTruthy(); expect(destination?.coordinate).toBeTruthy()
    const now = new Date(); const departureTime = now.getHours() * 60 + now.getMinutes(); const serviceDate = localDate(now)
    const direct = await providers.transitNetwork(origin!.coordinate, destination!.coordinate, departureTime, serviceDate)
    expect(direct.routes.length).toBeGreaterThan(0); expect(direct.trips.length).toBeGreaterThan(0)
    expect(direct.routes.some((route) => route.path && route.path.length > 1)).toBe(true)
    const router = new TimeDependentRouter(direct)
    expect(router.findJourneys({ originId: 'origin', destinationId: 'destination', departureTime, mode: 'normal' }).length).toBeGreaterThan(0)
    expect(router.findJourneys({ originId: 'origin', destinationId: 'destination', departureTime, mode: 'hard' }).length).toBeGreaterThan(0)

    const firstLeg = await providers.transitNetwork(origin!.coordinate, waypoint!.coordinate, departureTime, serviceDate)
    const firstJourney = new TimeDependentRouter(firstLeg).findJourneys({ originId: 'origin', destinationId: 'destination', departureTime, mode: 'normal', maxJourneys: 1 })[0]
    expect(firstJourney).toBeTruthy()
    const secondLeg = await providers.transitNetwork(waypoint!.coordinate, destination!.coordinate, firstJourney.arrivalTime, serviceDate)
    expect(new TimeDependentRouter(secondLeg).findJourneys({ originId: 'origin', destinationId: 'destination', departureTime: firstJourney.arrivalTime, mode: 'normal' }).length).toBeGreaterThan(0)
  }, 60_000)
})

function isTagoAccessUnavailable(error: unknown): error is ServiceError {
  return error instanceof ServiceError && error.provider === 'tago'
    && (error.code === 'UPSTREAM_TIMEOUT' || error.message === 'Upstream returned HTTP 403')
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
