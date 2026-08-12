import { describe, expect, it } from 'vitest'
import { ProviderUnavailableError } from '../providers/availability'
import { createTransitApplication } from './createApplication'

describe('application composition', () => {
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
      providerId: 'public-data-bus',
    })
  })
})
