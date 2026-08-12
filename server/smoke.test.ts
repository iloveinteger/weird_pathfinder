import { describe, expect, it } from 'vitest'
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

  smoke('4-6 TAGO bus stops, routes and arrivals', async () => {
    const stops = await providers.busStops({ latitude: 36.3, longitude: 127.3 })
    expect(stops.length).toBeGreaterThan(0)
    const routes = await providers.busRoutes('25', '5')
    expect(routes.length).toBeGreaterThan(0)
    expect((await providers.busRouteStops('25', routes[0].id)).length).toBeGreaterThan(0)
    expect(await providers.busArrivals('25', stops[0].id)).toBeInstanceOf(Array)
    expect(await providers.busVehicles('25', routes[0].id)).toBeInstanceOf(Array)
  }, 20_000)

  smoke('7 TAGO subway information', async () => {
    const stations = await providers.subwayStations('서울')
    expect(stations.length).toBeGreaterThan(0)
    expect(await providers.subwayTimetable(stations[0].id, new Date().toISOString().slice(0, 10))).toBeInstanceOf(Array)
  }, 20_000)

  smoke('8 Seoul subway realtime', async () => {
    expect(await providers.subwayRealtime('서울', '서울')).toBeInstanceOf(Array)
  }, 20_000)

  smoke('Seoul Open API key and station endpoint', async () => {
    expect(await providers.seoulStations('서울역')).toBeTruthy()
  }, 20_000)
})
