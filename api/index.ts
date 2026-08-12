import type { IncomingMessage, ServerResponse } from 'node:http'
import { createBackend } from '../server/app'

const backend = createBackend(process.env)

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const protocol = request.headers['x-forwarded-proto'] ?? 'https'
  const host = request.headers.host ?? 'localhost'
  const result = await backend({ method: request.method ?? 'GET', url: `${protocol}://${host}${request.url ?? '/'}`, headers: request.headers as HeadersInit })
  response.statusCode = result.status
  Object.entries(result.headers).forEach(([name, value]) => response.setHeader(name, value))
  if (result.status === 204) return response.end()
  response.end(JSON.stringify(result.body))
}
