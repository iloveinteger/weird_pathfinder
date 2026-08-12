import { describe, expect, it } from 'vitest'
import type { TransitNetwork } from '../src/routing/network'
import { isSeoulTransitServiceWindow, retainNightService } from './providers'

describe('current Seoul transit availability', () => {
  it('rejects stale daytime service during the overnight gap', () => {
    expect(isSeoulTransitServiceWindow(2 * 60 + 45)).toBe(false)
    expect(isSeoulTransitServiceWindow(5 * 60)).toBe(true)
    const network = {
      points: [], walkingLinks: [],
      routes: [
        { id: 'subway', name: '신분당선', mode: 'subway', color: '#0a0', stopIds: [] },
        { id: 'day-bus', name: '402', mode: 'bus', color: '#00a', stopIds: [] },
        { id: 'night-bus', name: 'N75(심야)', mode: 'bus', color: '#00a', stopIds: [] },
      ],
      trips: [
        { id: 'subway-trip', routeId: 'subway', headsign: '', serviceDate: '2026-08-13', stops: [] },
        { id: 'day-trip', routeId: 'day-bus', headsign: '', serviceDate: '2026-08-13', stops: [] },
        { id: 'night-trip', routeId: 'night-bus', headsign: '', serviceDate: '2026-08-13', stops: [] },
      ],
    } satisfies TransitNetwork

    expect(retainNightService(network)).toMatchObject({ routes: [{ id: 'night-bus' }], trips: [{ id: 'night-trip' }] })
  })
})
