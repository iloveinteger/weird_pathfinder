import { describe, expect, it, vi } from 'vitest'
import type { PlaceSearchResult } from '../domain/models'
import type { TransitProviderSet } from '../providers/interfaces'
import type { TransitNetwork } from '../routing/network'
import { RealTransitPlanner } from './realTransitPlanner'

const places: PlaceSearchResult[] = [
  { id: 'o', name: '출발지', address: '', coordinate: { latitude: 37.5, longitude: 127 } },
  { id: 'w', name: '경유지', address: '', coordinate: { latitude: 37.51, longitude: 127.01 } },
  { id: 'd', name: '목적지', address: '', coordinate: { latitude: 37.52, longitude: 127.02 } },
]

describe('RealTransitPlanner walking geometry', () => {
  it('uses the walking provider for every waypoint leg', async () => {
    const network = vi.fn(async ({ origin, destination }: { origin: PlaceSearchResult['coordinate']; destination: PlaceSearchResult['coordinate'] }): Promise<TransitNetwork> => ({
      points: [
        { id: 'origin', kind: 'place', name: '출발', coordinate: origin },
        { id: 'destination', kind: 'place', name: '도착', coordinate: destination },
      ],
      routes: [],
      trips: [],
      walkingLinks: [{ fromStopId: 'origin', toStopId: 'destination', distanceMeters: 1, durationMinutes: 1, purpose: 'access', path: [origin, destination] }],
    }))
    const walking = vi.fn(async (from: PlaceSearchResult['coordinate'], to: PlaceSearchResult['coordinate']) => ({
      distanceMeters: 900,
      durationMinutes: 12,
      path: [from, { latitude: (from.latitude + to.latitude) / 2, longitude: (from.longitude + to.longitude) / 2 }, to],
    }))
    const providers = {
      place: { search: async (query: string) => places.filter((place) => place.name.includes(query)), reverseGeocode: async () => null },
      walking: { getRoute: walking },
      network: { getNetwork: network },
      bus: {},
      subway: {},
    } as unknown as TransitProviderSet
    const planner = new RealTransitPlanner(providers)
    await Promise.all(places.map((place) => planner.searchPlaces(place.name)))

    const routes = await planner.findRoutes({
      originId: 'o',
      destinationId: 'd',
      departureTime: 540,
      waypoints: [{ id: 'waypoint-1', placeId: 'w', name: '경유지', dwellMinutes: 5 }],
      mode: 'walking',
    })

    expect(network).toHaveBeenCalledTimes(2)
    expect(walking).toHaveBeenCalledTimes(2)
    expect(routes[0].variants[0].journey.segments).toHaveLength(2)
    expect(routes[0].variants[0].journey.segments.every((segment) => segment.path?.length === 3)).toBe(true)
    expect(routes[0].variants[0].journey.walkingDistanceMeters).toBe(1_800)
  })

  it('keeps the network geometry when the walking provider is unavailable', async () => {
    const origin = places[0]; const destination = places[2]
    const fallbackPath = [origin.coordinate, destination.coordinate]
    const providers = {
      place: { search: async (query: string) => places.filter((place) => place.name.includes(query)), reverseGeocode: async () => null },
      walking: { getRoute: vi.fn().mockRejectedValue(new Error('walking unavailable')) },
      network: { getNetwork: async (): Promise<TransitNetwork> => ({
        points: [
          { id: 'origin', kind: 'place', name: origin.name, coordinate: origin.coordinate },
          { id: 'destination', kind: 'place', name: destination.name, coordinate: destination.coordinate },
        ],
        routes: [], trips: [],
        walkingLinks: [{ fromStopId: 'origin', toStopId: 'destination', distanceMeters: 100, durationMinutes: 2, purpose: 'access', path: fallbackPath }],
      }) },
      bus: {}, subway: {},
    } as unknown as TransitProviderSet
    const planner = new RealTransitPlanner(providers)
    await planner.searchPlaces(origin.name); await planner.searchPlaces(destination.name)

    const routes = await planner.findRoutes({ originId: origin.id, destinationId: destination.id, departureTime: 540, waypoints: [], mode: 'walking' })

    expect(routes[0].variants[0].journey.segments[0].path).toEqual(fallbackPath)
  })

  it('returns at most three recommended route patterns', async () => {
    const origin = places[0]; const destination = places[2]
    const routeIds = ['r1', 'r2', 'r3', 'r4']
    const providers = {
      place: { search: async (query: string) => places.filter((place) => place.name.includes(query)), reverseGeocode: async () => null },
      walking: { getRoute: vi.fn() },
      network: { getNetwork: async (): Promise<TransitNetwork> => ({
        points: [
          { id: 'origin', kind: 'place', name: origin.name, coordinate: origin.coordinate },
          { id: 'destination', kind: 'place', name: destination.name, coordinate: destination.coordinate },
        ],
        routes: routeIds.map((id) => ({ id, name: id, mode: 'bus' as const, color: '#00f', stopIds: ['origin', 'destination'] })),
        trips: routeIds.map((routeId, index) => ({ id: `t${index}`, routeId, headsign: destination.name, serviceDate: '2026-08-13', stops: [
          { stopId: 'origin', arrivalTime: 540, departureTime: 540, sequence: 0 },
          { stopId: 'destination', arrivalTime: 550 + index, departureTime: 550 + index, sequence: 1 },
        ] })),
        walkingLinks: [],
      }) },
      bus: {}, subway: {},
    } as unknown as TransitProviderSet
    const planner = new RealTransitPlanner(providers)
    await planner.searchPlaces(origin.name); await planner.searchPlaces(destination.name)

    const routes = await planner.findRoutes({ originId: origin.id, destinationId: destination.id, departureTime: 540, waypoints: [], mode: 'hard' })

    expect(routes).toHaveLength(3)
    expect(routes.map((route) => route.patternKey)).toEqual(['r1', 'r2', 'r3'])
  })
})
