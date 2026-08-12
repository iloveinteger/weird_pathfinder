export type UpstreamErrorCode = 'BAD_REQUEST' | 'MALFORMED_UPSTREAM' | 'QUOTA_EXCEEDED' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'NOT_CONFIGURED'

export class ServiceError extends Error {
  constructor(
    readonly code: UpstreamErrorCode,
    readonly status: number,
    message: string,
    readonly provider?: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export function safeErrorBody(error: unknown) {
  if (error instanceof ServiceError) {
    return { error: { code: error.code, message: error.message, provider: error.provider } }
  }
  return { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Unexpected backend failure' } }
}
