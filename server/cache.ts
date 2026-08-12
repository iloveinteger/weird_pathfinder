interface CacheEntry<T> { value: T; expiresAt: number }

/** Per-instance TTL cache with single-flight request coalescing. */
export class TtlSingleFlightCache {
  private readonly values = new Map<string, CacheEntry<unknown>>()
  private readonly pending = new Map<string, Promise<unknown>>()

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.value as T
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight as Promise<T>

    const request = load().then((value) => {
      this.values.set(key, { value, expiresAt: this.now() + ttlMs })
      return value
    }).finally(() => this.pending.delete(key))
    this.pending.set(key, request)
    return request
  }

  clear(): void { this.values.clear(); this.pending.clear() }
}

export const CACHE_TTL = {
  staticTransit: 6 * 60 * 60_000,
  place: 10 * 60_000,
  walking: 15 * 60_000,
  realtime: 15_000,
} as const
