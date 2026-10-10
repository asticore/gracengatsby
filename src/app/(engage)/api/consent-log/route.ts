import { getEngine } from '@/lib/engine'
import { normaliseConsentConfig } from '@/features/consent/config'
import { consentLogDetail, MAX_CONSENT_LOG_BYTES, parseConsentLogBody } from '@/features/consent/log'
import { normaliseCountry } from '@/features/consent/regions'
import { audit } from '@/features/security/auditLog'
import { clientKey, hit } from '@/features/security/rateLimit'
import { getSecuritySettings } from '@/features/security/settings'

export const dynamic = 'force-dynamic'

/** Per client, per minute, per isolate (see rateLimit.ts for what that means). */
const CONSENT_LOG_LIMIT = 30

const noContent = (status = 204, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

const JSON_TYPE = /^application\/json\s*(;|$)/i

/**
 * Reads the body up to `max` bytes. Stops reading as soon as the limit is
 * passed, so an oversized body is never buffered. Returns null when it is too big.
 */
async function readCappedText(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch((): void => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * POST /api/consent-log - records one consent decision, anonymised.
 *
 * Public and unauthenticated by design: the visitor is not signed in. Writes
 * an audit entry (consent.update) only when the Integrations "keep a log"
 * setting is on. Always answers 204 for a valid request, whether or not it
 * was logged, so the response reveals nothing about the settings.
 */
export async function POST(request: Request): Promise<Response> {
  const limit = hit(`consent-log:${clientKey(request)}`, CONSENT_LOG_LIMIT)
  if (limit.limited) return noContent(429, { 'Retry-After': String(limit.retryAfterSeconds) })

  if (!JSON_TYPE.test(request.headers.get('content-type') ?? '')) return noContent(415)

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_CONSENT_LOG_BYTES) return noContent(413)

  let text: string | null
  try {
    text = await readCappedText(request, MAX_CONSENT_LOG_BYTES)
  } catch {
    return noContent(400)
  }
  if (text === null) return noContent(413)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return noContent(400)
  }

  const body = parseConsentLogBody(raw)
  if (!body) return noContent(400)

  try {
    const engine = await getEngine()
    const integrations = await engine
      .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
      .catch((): null => null)
    const config = normaliseConsentConfig(integrations, null)
    if (!config.logConsent) return noContent()

    const settings = await getSecuritySettings(engine)
    const region = config.geoLogging ? normaliseCountry(request.headers.get('cf-ipcountry')) : null
    // No ip or userAgent on purpose: the entry is the decision, nothing about the visitor.
    await audit({ action: 'consent.update', detail: consentLogDetail(body, region) }, settings)
  } catch {
    // A logging failure must not turn a valid choice into an error for the visitor.
  }

  return noContent()
}