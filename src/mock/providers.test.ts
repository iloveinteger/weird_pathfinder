import { describe, expect, it } from 'vitest'
import { MockBusProvider, MockPlaceProvider, MockSubwayProvider } from './providers'

describe('mock providers', () => {
  it('exposes adapter-compatible place and transit data without network calls', async () => {
    const places = await new MockPlaceProvider().search('서울역')
    const busRoutes = await new MockBusProvider().getRoutes()
    const subwayRoutes = await new MockSubwayProvider().getRoutes()
    expect(places[0].id).toBe('seoul-bus')
    expect(busRoutes.every((route) => route.mode === 'bus')).toBe(true)
    expect(subwayRoutes.every((route) => route.mode === 'subway')).toBe(true)
  })
})
