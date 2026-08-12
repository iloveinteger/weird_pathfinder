export type ProviderId = 'kakao-local' | 'walking-route' | 'public-data-bus' | 'seoul-subway-realtime' | 'transit-network'

/** Stable failure used while a real adapter or its backend endpoint is not available. */
export class ProviderUnavailableError extends Error {
  readonly code = 'PROVIDER_UNAVAILABLE'

  constructor(readonly providerId: ProviderId) {
    super(`Provider unavailable: ${providerId}`)
    this.name = 'ProviderUnavailableError'
  }
}

export function unavailable<T>(providerId: ProviderId): Promise<T> {
  return Promise.reject(new ProviderUnavailableError(providerId))
}
