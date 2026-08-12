import { describe, expect, it } from 'vitest'
import { ServiceError } from './errors'
import { TimeDependentRouter } from '../src/routing/router'
import { normalizeKakaoPlaces, normalizeKakaoTransitNetwork, normalizeKakaoWalking, normalizeSeoulRealtime, normalizeTagoArrivals, normalizeTagoStops, normalizeTagoSubwayStations, normalizeTagoSubwayTrips } from './normalizers'

const tago = (item: unknown, resultCode = '00') => ({ response: { header: { resultCode, resultMsg: 'OK' }, body: { items: { item } } } })

describe('provider response normalization', () => {
  it('normalizes Kakao places and walking geometry', () => {
    expect(normalizeKakaoPlaces({ documents: [{ id: '1', place_name: '서울역', address_name: '서울 중구', x: '126.97', y: '37.55' }] })[0]).toMatchObject({ id: 'kakao:1', coordinate: { latitude: 37.55, longitude: 126.97 } })
    expect(normalizeKakaoWalking({ status: 'OK', route: { properties: { totalDistance: 120, totalTime: 90 }, legs: [{ steps: [{ path: { points: [[126.97, 37.55], [126.98, 37.56]] } }] }] } })).toEqual({ distanceMeters: 120, durationMinutes: 2, path: [{ latitude: 37.55, longitude: 126.97 }, { latitude: 37.56, longitude: 126.98 }] })
  })

  it('normalizes TAGO stop and arrival payloads including singleton items', () => {
    expect(normalizeTagoStops(tago({ nodeid: 'S1', nodenm: '정류장', gpslati: '37.5', gpslong: '127.0' }))[0]).toMatchObject({ id: 'S1', kind: 'bus-stop' })
    const observedAt = new Date('2026-08-13T00:00:00Z')
    expect(normalizeTagoArrivals(tago({ routeid: 'R1', arrtime: 60 }), 'S1', observedAt)[0].expectedAt.toISOString()).toBe('2026-08-13T00:01:00.000Z')
  })

  it('normalizes the current TAGO subway station, line and timetable fields', () => {
    const stations = normalizeTagoSubwayStations(tago({ subwayStationId: 'MTRS11133', subwayStationName: '서울역', subwayRouteName: '서울 1호선' }))
    expect(stations[0]).toMatchObject({ id: 'MTRS11133', name: '서울역', lineIds: ['서울 1호선'] })
    const trips = normalizeTagoSubwayTrips(tago({ subwayRouteId: 'MTRS11', subwayStationId: 'MTRS11133', endSubwayStationNm: '신창', arrTime: '052000', depTime: '052030' }), '2026-08-13')
    expect(trips[0]).toMatchObject({ routeId: 'MTRS11', headsign: '신창', stops: [{ stopId: 'MTRS11133', arrivalTime: 320 }] })
  })

  it('keeps Seoul realtime data as an overlay instead of mutating static trips', () => {
    const observedAt = new Date('2026-08-13T00:00:00Z')
    const overlay = normalizeSeoulRealtime({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [{ subwayId: '1002', btrainNo: '22', barvlDt: '120', arvlMsg2: '2분 후' }] }, '서울역', observedAt)
    expect(overlay[0]).toMatchObject({ stopId: '서울역', source: 'seoul-realtime', tripId: '22' })
    expect(overlay[0].expectedAt.toISOString()).toBe('2026-08-13T00:02:00.000Z')
  })

  it('feeds a normalized real snapshot into the existing routing core', () => {
    const step = (time: number, distance: number, points: number[][], vehicles?: unknown[]) => ({ properties: { time, distance, vehicles, guidance: '701' }, path: { points } })
    const raw = { status: 'OK', routes: [{ steps: [
      step(120, 100, [[126.97, 37.55], [126.971, 37.551]]),
      step(600, 4000, [[126.971, 37.551], [127.0, 37.57]], [{ type: 'BUS', name: '701' }]),
      step(60, 50, [[127.0, 37.57], [127.001, 37.571]]),
    ] }] }
    const network = normalizeKakaoTransitNetwork(raw, { latitude: 37.55, longitude: 126.97 }, { latitude: 37.571, longitude: 127.001 }, 540, '2026-08-13')
    const journeys = new TimeDependentRouter(network).findJourneys({ originId: 'origin', destinationId: 'destination', departureTime: 540, mode: 'normal' })
    expect(journeys[0].segments.some((segment) => segment.type === 'transit' && segment.mode === 'bus')).toBe(true)
  })

  it('rejects malformed and quota responses with stable error codes', () => {
    expect(() => normalizeKakaoPlaces({ documents: [{ id: 'bad' }] })).toThrow(ServiceError)
    expect(() => normalizeTagoStops(tago([], '22'))).toThrow(expect.objectContaining({ code: 'QUOTA_EXCEEDED' }))
  })
})
