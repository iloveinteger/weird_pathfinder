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
      providerId: 'kakao-local',
    } satisfies Partial<ProviderUnavailableError>)
    await expect(application.providers.bus.getRoutes()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      providerId: 'transit-network',
    })
  })

  it('switches real mode to the backend-backed place provider', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      expect(this).toBe(window)
      return Promise.resolve(new Response(JSON.stringify([{ id: 'kakao:1', name: '서울역', address: '서울', coordinate: { latitude: 37.55, longitude: 126.97 } }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    })
    vi.stubGlobal('fetch', fetcher)
    const application = createTransitApplication({ providerMode: 'real', apiBaseUrl: 'https://backend.example/api' })
    await expect(application.planner.searchPlaces('서울역')).resolves.toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('retries a transient place request and identifies a lasting failure as kakao-local', async () => {
    const place = [{ id: 'kakao:1', name: '서울역', address: '서울', coordinate: { latitude: 37.55, longitude: 126.97 } }]
    const recoveringFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(new Response(JSON.stringify(place), { status: 200 }))
    vi.stubGlobal('fetch', recoveringFetch)
    const recovering = createTransitApplication({ providerMode: 'real', apiBaseUrl: 'https://backend.example/api' })
    await expect(recovering.planner.searchPlaces('서울역')).resolves.toEqual(place)
    expect(recoveringFetch).toHaveBeenCalledTimes(2)

    const failingFetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', failingFetch)
    const failing = createTransitApplication({ providerMode: 'real', apiBaseUrl: 'https://backend.example/api' })
    await expect(failing.planner.searchPlaces('서울역')).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', providerId: 'kakao-local' })
    expect(failingFetch).toHaveBeenCalledTimes(2)
  })
})
