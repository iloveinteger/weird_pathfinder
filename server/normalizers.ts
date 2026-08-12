import type { ArrivalEstimate, VehiclePosition, WalkingRoute } from '../src/providers/interfaces.js'
import type { Coordinate, PlaceSearchResult, TransitPoint, TransitRoute, TransitTrip } from '../src/domain/models.js'
import type { TransitNetwork, WalkingLink } from '../src/routing/network.js'
import { ServiceError } from './errors.js'

type RecordValue = Record<string, unknown>
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const number = (value: unknown): number => Number(text(value))
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]
const record = (value: unknown, provider: string): RecordValue => {
  if (!isRecord(value)) throw new ServiceError('MALFORMED_UPSTREAM', 502, 'Upstream response shape is invalid', provider)
  return value
}

export function normalizeKakaoPlaces(raw: unknown): PlaceSearchResult[] {
  const root = record(raw, 'kakao')
  return array(root.documents).map((item) => {
    const row = record(item, 'kakao')
    const latitude = number(row.y); const longitude = number(row.x)
    if (!text(row.id) || !text(row.place_name) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ServiceError('MALFORMED_UPSTREAM', 502, 'Kakao place response is invalid', 'kakao')
    }
    return { id: `kakao:${text(row.id)}`, name: text(row.place_name), address: text(row.road_address_name) || text(row.address_name), coordinate: { latitude, longitude } }
  })
}

export function normalizeKakaoReverse(raw: unknown, coordinate: Coordinate): PlaceSearchResult | null {
  const row = array(record(raw, 'kakao').documents)[0]
  if (!row) return null
  const value = record(row, 'kakao'); const road = isRecord(value.road_address) ? value.road_address : undefined; const land = isRecord(value.address) ? value.address : undefined
  const address = text(road?.address_name) || text(land?.address_name)
  return address ? { id: `coordinate:${coordinate.latitude},${coordinate.longitude}`, name: address, address, coordinate } : null
}

export function normalizeKakaoWalking(raw: unknown): WalkingRoute {
  const root = record(raw, 'kakao')
  if (root.status !== 'OK') throw new ServiceError('UPSTREAM_UNAVAILABLE', 502, `Walking route unavailable: ${text(root.status) || 'UNKNOWN'}`, 'kakao')
  const route = record(root.route, 'kakao'); const properties = record(route.properties, 'kakao')
  const distanceMeters = number(properties.totalDistance); const seconds = number(properties.totalTime)
  const path = array(route.legs).flatMap((leg) => array(record(leg, 'kakao').steps)).flatMap((step) => array(record(record(step, 'kakao').path, 'kakao').points)).map(pointToCoordinate)
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(seconds) || path.length < 2) throw new ServiceError('MALFORMED_UPSTREAM', 502, 'Kakao walking response is invalid', 'kakao')
  return { distanceMeters, durationMinutes: Math.max(1, Math.ceil(seconds / 60)), path }
}

function pointToCoordinate(value: unknown): Coordinate {
  if (!Array.isArray(value) || value.length < 2) throw new ServiceError('MALFORMED_UPSTREAM', 502, 'Coordinate path is invalid', 'kakao')
  const longitude = number(value[0]); const latitude = number(value[1])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new ServiceError('MALFORMED_UPSTREAM', 502, 'Coordinate path is invalid', 'kakao')
  return { latitude, longitude }
}

export function tagoItems(raw: unknown): RecordValue[] {
  const response = record(record(raw, 'tago').response, 'tago')
  const header = record(response.header, 'tago'); const code = text(header.resultCode)
  if (code !== '00') throw new ServiceError(code === '22' || code === '30' ? 'QUOTA_EXCEEDED' : 'UPSTREAM_UNAVAILABLE', code === '22' || code === '30' ? 429 : 502, `TAGO error ${code || 'UNKNOWN'}`, 'tago')
  const body = record(response.body, 'tago'); const items = isRecord(body.items) ? body.items.item : undefined
  return array(items).map((item) => record(item, 'tago'))
}

export function normalizeTagoStops(raw: unknown): TransitPoint[] {
  return tagoItems(raw).map((row) => {
    const latitude = number(row.gpslati); const longitude = number(row.gpslong)
    if (!text(row.nodeid) || !text(row.nodenm) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new ServiceError('MALFORMED_UPSTREAM', 502, 'TAGO stop response is invalid', 'tago')
    return { id: text(row.nodeid), kind: 'bus-stop' as const, name: text(row.nodenm), coordinate: { latitude, longitude } }
  })
}

export function normalizeTagoRoutes(raw: unknown): TransitRoute[] {
  return tagoItems(raw).map((row) => ({ id: text(row.routeid), name: text(row.routeno) || text(row.routenm), mode: 'bus' as const, color: '#3471ce', stopIds: [] })).filter((route) => route.id && route.name)
}

export function normalizeTagoRouteStops(raw: unknown): TransitPoint[] {
  return normalizeTagoStopsFromRows(tagoItems(raw).sort((a, b) => number(a.nodeord) - number(b.nodeord)))
}

function normalizeTagoStopsFromRows(rows: RecordValue[]): TransitPoint[] {
  return rows.map((row) => ({ id: text(row.nodeid), kind: 'bus-stop' as const, name: text(row.nodenm), coordinate: { latitude: number(row.gpslati), longitude: number(row.gpslong) } }))
    .filter((stop) => stop.id && stop.name && Number.isFinite(stop.coordinate.latitude) && Number.isFinite(stop.coordinate.longitude))
}

export function normalizeTagoArrivals(raw: unknown, stopId: string, observedAt = new Date()): ArrivalEstimate[] {
  return tagoItems(raw).map((row) => ({ stopId, routeId: text(row.routeid), expectedAt: new Date(observedAt.getTime() + number(row.arrtime) * 1000) })).filter((item) => item.routeId && !Number.isNaN(item.expectedAt.getTime()))
}

export function normalizeTagoVehicles(raw: unknown, routeId: string, observedAt = new Date()): VehiclePosition[] {
  return tagoItems(raw).map((row) => ({ vehicleId: text(row.vehicleno), coordinate: { latitude: number(row.gpslati), longitude: number(row.gpslong) }, observedAt })).filter((item) => item.vehicleId && Number.isFinite(item.coordinate.latitude) && Number.isFinite(item.coordinate.longitude))
}

export function normalizeTagoSubwayStations(raw: unknown): TransitPoint[] {
  return tagoItems(raw).map((row) => ({
    id: text(row.subwayStationId) || text(row.subwaystationid) || text(row.stationid),
    kind: 'station' as const,
    name: text(row.subwayStationName) || text(row.subwaystationname) || text(row.stationname),
    lineIds: [text(row.subwayRouteId) || text(row.subwayRouteName) || text(row.routename) || text(row.routeid)].filter(Boolean),
    // TAGO's station-list operation does not publish coordinates. Keep the
    // existing domain shape; routing geometry comes from the network provider.
    coordinate: { latitude: number(row.gpslati), longitude: number(row.gpslong) },
  })).filter((item) => item.id && item.name && item.lineIds.length)
}

export function normalizeTagoSubwayTrips(raw: unknown, serviceDate: string): TransitTrip[] {
  return tagoItems(raw).map((row, index) => {
    const stationId = text(row.subwayStationId) || text(row.subwaystationid) || text(row.stationid)
    const routeId = text(row.subwayRouteId) || text(row.routeid) || `subway:${text(row.subwayRouteName) || text(row.routename)}`
    const clock = text(row.arrTime) || text(row.depTime) || text(row.arrivaltime) || text(row.deptime) || text(row.departuretime)
    const minutes = parseServiceClock(clock)
    return { id: text(row.trainno) || `${routeId}:${serviceDate}:${index}`, routeId, headsign: text(row.endSubwayStationNm) || text(row.endsubwaystationname) || text(row.endstationname), serviceDate, stops: stationId && minutes !== undefined ? [{ stopId: stationId, arrivalTime: minutes, departureTime: minutes, sequence: 0 }] : [] }
  }).filter((trip) => trip.stops.length)
}

function parseServiceClock(value: string): number | undefined {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return undefined
  const hour = Number(digits.slice(0, 2)); const minute = Number(digits.slice(2, 4))
  return Number.isFinite(hour) && minute < 60 ? hour * 60 + minute : undefined
}

export interface RealtimeArrivalOverlay extends ArrivalEstimate { observedAt: Date; source: 'seoul-realtime'; message?: string }

export function normalizeSeoulRealtime(raw: unknown, stopId: string, observedAt = new Date()): RealtimeArrivalOverlay[] {
  const root = record(raw, 'seoul-subway'); const error = isRecord(root.errorMessage) ? root.errorMessage : undefined
  if (error && text(error.code) === 'INFO-200') return []
  if (error && text(error.code) !== 'INFO-000') throw new ServiceError(text(error.code) === 'INFO-100' ? 'QUOTA_EXCEEDED' : 'UPSTREAM_UNAVAILABLE', text(error.code) === 'INFO-100' ? 429 : 502, `Seoul realtime error ${text(error.code)}`, 'seoul-subway')
  return array(root.realtimeArrivalList).map((item) => {
    const row = record(item, 'seoul-subway'); const seconds = number(row.barvlDt)
    return { stopId, routeId: `subway:${text(row.subwayId) || text(row.trainLineNm)}`, tripId: text(row.btrainNo) || undefined, expectedAt: new Date(observedAt.getTime() + Math.max(0, seconds) * 1000), observedAt, source: 'seoul-realtime' as const, message: text(row.arvlMsg2) || undefined }
  })
}

export interface KakaoTransitBoarding { routeId: string; routeName: string; mode: 'bus' | 'subway'; stationName: string }

export function extractKakaoTransitBoardings(raw: unknown): KakaoTransitBoarding[] {
  const root = record(raw, 'kakao'); const boardings: KakaoTransitBoarding[] = []
  array(root.routes).forEach((candidate, candidateIndex) => {
    array(record(candidate, 'kakao').steps).forEach((stepValue, stepIndex) => {
      const props = record(record(stepValue, 'kakao').properties, 'kakao'); const vehicles = array(props.vehicles).map((value) => record(value, 'kakao'))
      const mode = kakaoTransitMode(props, vehicles)
      if (!mode) return
      const firstStop = array(props.stops)[0]
      boardings.push({
        routeId: `kakao-route:${candidateIndex}:${stepIndex}`,
        routeName: text(vehicles[0]?.name) || text(props.guidance) || `kakao-route:${candidateIndex}:${stepIndex}`,
        mode,
        stationName: firstStop ? text(record(firstStop, 'kakao').name) : '',
      })
    })
  })
  return boardings
}

/** Bootstrap network from Kakao transit candidates; all data is normalized before core use. */
export function normalizeKakaoTransitNetwork(raw: unknown, origin: Coordinate, destination: Coordinate, departureTime: number, serviceDate: string): TransitNetwork {
  const root = record(raw, 'kakao')
  if (root.status !== 'OK') throw new ServiceError('UPSTREAM_UNAVAILABLE', 502, `Transit route unavailable: ${text(root.status) || 'UNKNOWN'}`, 'kakao')
  const points: TransitPoint[] = [placePoint('origin', '출발지', origin), placePoint('destination', '목적지', destination)]
  const routes: TransitRoute[] = []; const trips: TransitTrip[] = []; const walkingLinks: WalkingLink[] = []
  array(root.routes).forEach((candidate, candidateIndex) => {
    let clock = departureTime; let previous = 'origin'; const steps = array(record(candidate, 'kakao').steps)
    steps.forEach((stepValue, stepIndex) => {
      const step = record(stepValue, 'kakao'); const props = record(step.properties, 'kakao'); const path = array(record(step.path, 'kakao').points).map(pointToCoordinate)
      if (path.length < 2) return
      const duration = Math.max(1, Math.ceil(number(props.time) / 60)); const distance = Math.max(0, number(props.distance)); const vehicles = array(props.vehicles).map((v) => record(v, 'kakao'))
      const fromId = previous; const toId = stepIndex === steps.length - 1 ? 'destination' : `kakao:${candidateIndex}:${stepIndex}:to`
      const stops = array(props.stops); const lastStop = stops[stops.length - 1]; const lastPathPoint = path[path.length - 1]
      if (toId !== 'destination' && !points.some((point) => point.id === toId)) points.push(placePoint(toId, text(lastStop && record(lastStop, 'kakao').name) || `환승 ${stepIndex + 1}`, lastPathPoint))
      const transitMode = kakaoTransitMode(props, vehicles)
      if (!transitMode) walkingLinks.push({ fromStopId: fromId, toStopId: toId, distanceMeters: distance, durationMinutes: duration, purpose: stepIndex === 0 ? 'access' : stepIndex === steps.length - 1 ? 'egress' : 'transfer', path })
      else {
        const routeId = `kakao-route:${candidateIndex}:${stepIndex}`; const routeName = text(vehicles[0]?.name) || text(props.guidance) || routeId
        routes.push({ id: routeId, name: routeName, mode: transitMode, color: transitMode === 'bus' ? '#3471ce' : '#21a368', stopIds: [fromId, toId], path })
        trips.push({ id: `kakao-trip:${candidateIndex}:${stepIndex}`, routeId, headsign: routeName, serviceDate, stops: [{ stopId: fromId, arrivalTime: clock, departureTime: clock, sequence: 0 }, { stopId: toId, arrivalTime: clock + duration, departureTime: clock + duration, sequence: 1 }] })
      }
      clock += duration; previous = toId
    })
    if (previous !== 'destination') walkingLinks.push({ fromStopId: previous, toStopId: 'destination', distanceMeters: 0, durationMinutes: 1, purpose: 'egress' })
  })
  return { points: uniqueById(points), routes, trips, walkingLinks }
}

function kakaoTransitMode(props: Record<string, unknown>, vehicles: Array<Record<string, unknown>>): 'bus' | 'subway' | undefined {
  const modeValue = text(vehicles[0]?.type).toUpperCase(); const propertyType = text(props.type).toUpperCase()
  return modeValue.includes('SUBWAY') || propertyType.includes('SUBWAY') ? 'subway' : modeValue || vehicles.length || propertyType.includes('BUS') ? 'bus' : undefined
}

const placePoint = (id: string, name: string, coordinate: Coordinate): TransitPoint => ({ id, kind: 'place', name, coordinate })
const uniqueById = <T extends { id: string }>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()]
