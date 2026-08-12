import { describe, expect, it, vi } from 'vitest'
import { TtlSingleFlightCache } from './cache'

describe('TtlSingleFlightCache', () => {
  it('coalesces concurrent requests and reuses the value until expiry', async () => {
    let now = 100; const cache = new TtlSingleFlightCache(() => now)
    const load = vi.fn(async () => 'value')
    const [first, second] = await Promise.all([cache.get('same', 50, load), cache.get('same', 50, load)])
    expect([first, second]).toEqual(['value', 'value']); expect(load).toHaveBeenCalledTimes(1)
    await cache.get('same', 50, load); expect(load).toHaveBeenCalledTimes(1)
    now = 151; await cache.get('same', 50, load); expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures', async () => {
    const cache = new TtlSingleFlightCache(); const load = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok')
    await expect(cache.get('key', 10, load)).rejects.toThrow('fail')
    await expect(cache.get('key', 10, load)).resolves.toBe('ok')
  })
})
