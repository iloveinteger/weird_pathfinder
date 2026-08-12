import { ServiceError } from './errors'

export type FetchLike = typeof fetch

export interface FetchJsonOptions {
  provider: string
  timeoutMs?: number
  retries?: number
  fetcher?: FetchLike
}

export async function fetchJson(url: string, init: RequestInit, options: FetchJsonOptions): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch
  const retries = options.retries ?? 1
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000)
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal })
      if (response.status === 429) throw new ServiceError('QUOTA_EXCEEDED', 429, 'Upstream quota exceeded', options.provider)
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 408
        if (retryable && attempt < retries) continue
        throw new ServiceError('UPSTREAM_UNAVAILABLE', 502, `Upstream returned HTTP ${response.status}`, options.provider)
      }
      try { return await response.json() }
      catch { throw new ServiceError('MALFORMED_UPSTREAM', 502, 'Upstream returned malformed JSON', options.provider) }
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.code === 'UPSTREAM_UNAVAILABLE' && attempt < retries) continue
        throw error
      }
      if ((error as { name?: string }).name === 'AbortError') {
        if (attempt < retries) continue
        throw new ServiceError('UPSTREAM_TIMEOUT', 504, 'Upstream request timed out', options.provider)
      }
      if (attempt >= retries) throw new ServiceError('UPSTREAM_UNAVAILABLE', 502, 'Upstream request failed', options.provider)
    } finally { clearTimeout(timer) }
  }
  throw new ServiceError('UPSTREAM_UNAVAILABLE', 502, 'Upstream request failed', options.provider)
}
