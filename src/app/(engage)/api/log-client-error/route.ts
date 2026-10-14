import { clientKey, hit } from '@/features/security/rateLimit'
import { checkClientReport, CLIENT_REPORT_MAX_BYTES } from '@/features/errors/clientReport'
import { logError } from '@/features/errors/log'

export const dynamic = 'force-dynamic'

/** Reports per client, per minute, per isolate (see rateLimit.ts for what that means). */
const CLIENT_ERROR_LIMIT = 20

const noContent = (status: number, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

/**
 * POST /api/log-client-error - an error the browser ran into on a public page.
 *
 * Public, so it accepts only same-origin requests, only small JSON bodies, and
 * only the four known fields. Always answers 204 for a valid report.
 */
export async function POST(request: Request): Promise<Response> {
  const own = new URL(request.url).origin
  const origin = request.headers.get('origin')
  const sameOrigin = origin ? origin === own : request.headers.get('sec-fetch-site') === 'same-origin'
  if (!sameOrigin) return noContent(403)

  const limit = hit(`client-error:${clientKey(request)}`, CLIENT_ERROR_LIMIT)
  if (limit.limited) return noContent(429, { 'Retry-After': String(limit.retryAfterSeconds) })

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > CLIENT_REPORT_MAX_BYTES) return noContent(413)

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > CLIENT_REPORT_MAX_BYTES) return noContent(413)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return noContent(400)
  }
  const check = checkClientReport(parsed)
  if (!check.ok) return noContent(400)

  const { message, stack, path, digest } = check.value
  await logError({
    source: 'client',
    message: digest ? `${message} (digest ${digest})` : message,
    stack,
    path,
    userAgent: request.headers.get('user-agent') ?? undefined,
  })
  return noContent(204)
}
