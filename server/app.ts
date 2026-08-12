import { ServiceError, safeErrorBody } from './errors.js'
import { UpstreamProviders, type ServerEnvironment } from './providers.js'

export interface BackendRequest { method: string; url: string; headers?: HeadersInit }
export interface BackendResponse { status: number; headers: Record<string, string>; body: unknown }

export function createBackend(environment: ServerEnvironment, providers = new UpstreamProviders(environment)) {
  return async (request: BackendRequest): Promise<BackendResponse> => {
    const origin = new Headers(request.headers).get('origin')
    const cors = corsHeaders(origin, environment.ALLOWED_ORIGIN)
    if (request.method === 'OPTIONS') return { status: 204, headers: cors, body: null }
    try {
      if (request.method !== 'GET') throw new ServiceError('BAD_REQUEST', 405, 'Only GET is supported')
      const url = new URL(request.url, 'http://localhost')
      const body = await route(url, providers)
      return { status: 200, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl(url.pathname) }, body }
    } catch (error) {
      const status = error instanceof ServiceError ? error.status : 500
      return { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: safeErrorBody(error) }
    }
  }
}

async function route(url: URL, providers: UpstreamProviders): Promise<unknown> {
  const path = url.pathname.replace(/^\/api/, '')
  if (path === '/health') return { ok: true }
  if (path === '/places/search') return providers.searchPlaces(required(url, 'q'))
  if (path === '/places/reverse') return providers.reverseGeocode(coordinate(url))
  if (path === '/walking') return providers.walking(coordinate(url, 'from'), coordinate(url, 'to'))
  if (path === '/transit/network') return providers.transitNetwork(coordinate(url, 'origin'), coordinate(url, 'destination'), numeric(url, 'departureTime'), required(url, 'serviceDate'))
  if (path === '/bus/stops') return providers.busStops(coordinate(url))
  if (path === '/bus/routes') return providers.busRoutes(required(url, 'cityCode'), url.searchParams.get('routeNo') ?? undefined)
  if (path === '/bus/route-stops') return providers.busRouteStops(required(url, 'cityCode'), required(url, 'routeId'))
  if (path === '/bus/arrivals') return providers.busArrivals(required(url, 'cityCode'), required(url, 'stopId'))
  if (path === '/bus/vehicles') return providers.busVehicles(required(url, 'cityCode'), required(url, 'routeId'))
  if (path === '/subway/stations') return providers.subwayStations(required(url, 'q'))
  if (path === '/subway/timetable') return providers.subwayTimetable(required(url, 'stationId'), required(url, 'serviceDate'), url.searchParams.get('dayType') ?? undefined, url.searchParams.get('direction') ?? undefined)
  if (path === '/subway/realtime') return providers.subwayRealtime(required(url, 'stationName'), url.searchParams.get('stationId') ?? undefined)
  if (path === '/seoul/stations') return providers.seoulStations(url.searchParams.get('stationName') ?? undefined)
  throw new ServiceError('BAD_REQUEST', 404, 'Endpoint not found')
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim()
  if (!value) throw new ServiceError('BAD_REQUEST', 400, `Missing query parameter: ${name}`)
  return value
}

function numeric(url: URL, name: string): number {
  const value = Number(required(url, name))
  if (!Number.isFinite(value)) throw new ServiceError('BAD_REQUEST', 400, `Invalid query parameter: ${name}`)
  return value
}

function coordinate(url: URL, prefix = '') {
  const latitude = numeric(url, prefix ? `${prefix}Lat` : 'lat'); const longitude = numeric(url, prefix ? `${prefix}Lng` : 'lng')
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new ServiceError('BAD_REQUEST', 400, 'Coordinate is out of range')
  return { latitude, longitude }
}

function corsHeaders(origin: string | null, configured?: string): Record<string, string> {
  const allowed = configured?.split(',').map((item) => item.trim()).filter(Boolean) ?? ['http://localhost:5173', 'https://iloveinteger.github.io']
  return {
    'access-control-allow-origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  }
}

function cacheControl(path: string): string {
  if (/arrivals|vehicles|realtime|network/.test(path)) return 'public, max-age=10, s-maxage=15, stale-while-revalidate=15'
  if (/stops|routes|timetable|stations/.test(path)) return 'public, max-age=300, s-maxage=21600, stale-while-revalidate=3600'
  return 'public, max-age=60, s-maxage=600, stale-while-revalidate=300'
}
