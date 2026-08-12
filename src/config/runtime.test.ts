import { describe, expect, it } from 'vitest'
import { loadPublicRuntimeConfig } from './runtime'

describe('public runtime configuration', () => {
  it('defaults to mock mode without exposing server-only configuration', () => {
    expect(loadPublicRuntimeConfig({})).toEqual({ providerMode: 'mock' })
  })

  it('accepts real mode and the public Kakao JavaScript key', () => {
    expect(loadPublicRuntimeConfig({
      VITE_PROVIDER_MODE: 'real',
      VITE_KAKAO_JAVASCRIPT_KEY: 'public-browser-key',
    })).toEqual({ providerMode: 'real', kakaoJavaScriptKey: 'public-browser-key' })
  })

  it('rejects an unknown provider mode', () => {
    expect(() => loadPublicRuntimeConfig({ VITE_PROVIDER_MODE: 'hybrid' })).toThrow('Invalid VITE_PROVIDER_MODE')
  })
})
