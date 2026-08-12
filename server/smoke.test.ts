import { describe, expect, it } from 'vitest'
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
      const stations = await providers.subwayStations('서울')
      expect(stations.length).toBeGreaterThan(0)
      expect(await providers.subwayTimetable(stations[0].id, new Date().toISOString().slice(0, 10))).toBeInstanceOf(Array)
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
})

function isTagoAccessUnavailable(error: unknown): error is ServiceError {
  return error instanceof ServiceError && error.provider === 'tago'
    && (error.code === 'UPSTREAM_TIMEOUT' || error.message === 'Upstream returned HTTP 403')
}
