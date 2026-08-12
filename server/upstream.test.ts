import { describe, expect, it, vi } from 'vitest'
import { fetchJson } from './upstream'

describe('upstream HTTP policy', () => {
  it('maps quota responses without reading or logging credentials', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 429 })) as typeof fetch
    await expect(fetchJson('https://provider.invalid/resource', {}, { provider: 'test', fetcher, retries: 0 })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', status: 429 })
  })

  it('retries a limited number of transient failures', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 })) as typeof fetch
    await expect(fetchJson('https://provider.invalid/resource', {}, { provider: 'test', fetcher, retries: 1 })).resolves.toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed JSON', async () => {
    const fetcher = vi.fn(async () => new Response('not-json', { status: 200 })) as typeof fetch
    await expect(fetchJson('https://provider.invalid/resource', {}, { provider: 'test', fetcher, retries: 0 })).rejects.toMatchObject({ code: 'MALFORMED_UPSTREAM' })
  })
})
