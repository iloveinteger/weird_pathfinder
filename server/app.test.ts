import { describe, expect, it, vi } from 'vitest'
import { createBackend } from './app'
import { ServiceError } from './errors'
import type { UpstreamProviders } from './providers'

function providers(overrides: Partial<UpstreamProviders> = {}): UpstreamProviders {
  return { searchPlaces: vi.fn(async () => [{ id: '1' }]), ...overrides } as unknown as UpstreamProviders
}

describe('serverless backend proxy', () => {
  it('validates and routes place search without exposing upstream credentials', async () => {
    const upstream = providers(); const backend = createBackend({ ALLOWED_ORIGIN: 'https://example.test' }, upstream)
    const response = await backend({ method: 'GET', url: 'https://api.test/api/places/search?q=서울역', headers: { origin: 'https://example.test' } })
    expect(response.status).toBe(200); expect(response.headers['access-control-allow-origin']).toBe('https://example.test')
    expect(upstream.searchPlaces).toHaveBeenCalledWith('서울역')
  })

  it('returns safe validation and upstream errors', async () => {
    const backend = createBackend({}, providers({ searchPlaces: vi.fn(async () => { throw new ServiceError('QUOTA_EXCEEDED', 429, 'Upstream quota exceeded', 'kakao') }) }))
    expect((await backend({ method: 'GET', url: 'https://api.test/api/places/search' })).status).toBe(400)
    const quota = await backend({ method: 'GET', url: 'https://api.test/api/places/search?q=x' })
    expect(quota).toMatchObject({ status: 429, body: { error: { code: 'QUOTA_EXCEEDED', provider: 'kakao' } } })
  })

  it('allows both production frontends and project preview deployments', async () => {
    const backend = createBackend({ ALLOWED_ORIGIN: 'https://iloveinteger.github.io' }, providers())
    for (const origin of ['https://iloveinteger.github.io', 'https://weirdpath.vercel.app', 'https://weirdpath-preview-123.vercel.app']) {
      const response = await backend({ method: 'OPTIONS', url: 'https://api.test/api/places/search', headers: { origin } })
      expect(response.headers['access-control-allow-origin']).toBe(origin)
    }
  })
})
