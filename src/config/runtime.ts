export type ProviderMode = 'mock' | 'real'

export interface PublicRuntimeConfig {
  providerMode: ProviderMode
  kakaoJavaScriptKey?: string
}

export interface PublicEnvironment {
  readonly VITE_PROVIDER_MODE?: string
  readonly VITE_KAKAO_JAVASCRIPT_KEY?: string
}

export function loadPublicRuntimeConfig(environment: PublicEnvironment): PublicRuntimeConfig {
  const requestedMode = environment.VITE_PROVIDER_MODE?.trim().toLowerCase()
  if (requestedMode && requestedMode !== 'mock' && requestedMode !== 'real') {
    throw new Error(`Invalid VITE_PROVIDER_MODE: ${requestedMode}`)
  }

  const kakaoJavaScriptKey = environment.VITE_KAKAO_JAVASCRIPT_KEY?.trim()
  return {
    providerMode: requestedMode === 'real' ? 'real' : 'mock',
    ...(kakaoJavaScriptKey ? { kakaoJavaScriptKey } : {}),
  }
}
