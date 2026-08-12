import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderUnavailableError } from '../providers/availability'
import { createTransitApplication } from './createApplication'

describe('application composition', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('keeps the complete mock provider set as the default integration', async () => {
    const application = createTransitApplication({ providerMode: 'mock' })
    expect(application.providerMode).toBe('mock')
    await expect(application.providers.place.search('')).resolves.not.toHaveLength(0)
  })

  it('returns a stable unavailable error in real mode without making API calls', async () => {
    const application = createTransitApplication({ providerMode: 'real' })
    await expect(application.planner.searchPlaces('서울')).rejects.toMatchObject({
      name: 'ProviderUnavailableError',
      code: 'PROVIDER_UNAVAILABLE',
      providerId: 'transit-network',
    } satisfies Partial<ProviderUnavailableError>)
    await expect(application.providers.bus.getRoutes()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      providerId: 'transit-network',
    })
  })

  it('switches real mode to the backend-backed place provider', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ id: 'kakao:1', name: '서울역', address: '서울', coordinate: { latitude: 37.55, longitude: 126.97 } }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    const application = createTransitApplication({ providerMode: 'real', apiBaseUrl: 'https://backend.example/api' })
    await expect(application.planner.searchPlaces('서울역')).resolves.toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
