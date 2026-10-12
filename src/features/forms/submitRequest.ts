import { HONEYPOT_FIELD, RECAPTCHA_FIELD, RENDERED_AT_FIELD, TURNSTILE_FIELD } from './spam'
import { normaliseFormConfig } from './config'
import { isPublished } from './layout'
import { checkOrigin, corsHeaders } from './origin'
import { loadForm } from './server'
import type { PendingFile } from './upload'
import { MAX_FILES_PER_FIELD } from './upload'

/**
 * The HTTP side of a submission, shared by the public route
 * (/api/forms/:id-or-key/submit) and the engine's own collection endpoint, so
 * both behave identically.
 *
 * What it adds on top of `handleSubmission`:
 *  - the origin allow-list, enforced on the POST itself and on the preflight;
 *  - CORS headers that echo the one allowed origin (never `*`, never
 *    credentials - the endpoint is anonymous by design, see origin.ts);
 *  - the rate limit, before any body is read;
 *  - body parsing with a size cap: JSON, urlencoded, or multipart with files.
 */

export const MAX_JSON_BYTES = 400_000

type Engine = Parameters<typeof loadForm>[0] & Parameters<(typeof import('./submit'))['handleSubmission']>[0]

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

const clientIp = (request: Request): string | undefined =>
  request.headers.get('cf-connecting-ip') ||
  (process.env.NODE_ENV !== 'production'
    ? request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined) ||
  undefined

type Parsed = { body: Record<string, unknown>; files: Record<string, PendingFile[]> } | { error: Response }

/** Reads whichever body shape was sent. Repeated keys (a checkbox group) collapse into arrays. */
export async function parseSubmissionBody(request: Request, maxMultipartBytes: number): Promise<Parsed> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  const declared = Number(request.headers.get('content-length') || NaN)

  if (contentType.includes('multipart/form-data')) {
    // 0 means the form has no file field, so a multipart body has no business here.
    if (maxMultipartBytes <= 0) return { error: json({ ok: false, message: 'That request could not be read.' }, 400) }
    const { readLimitedForm } = await import('@/features/media/readBody')
    const read = await readLimitedForm(request, Math.min(maxMultipartBytes, 90 * 1024 * 1024))
    if ('response' in read) return { error: read.response }
    const body: Record<string, unknown> = {}
    const files: Record<string, PendingFile[]> = {}
    for (const [key, entry] of read.form.entries()) {
      if (typeof entry === 'string') {
        if (key in body) body[key] = Array.isArray(body[key]) ? [...(body[key] as unknown[]), entry] : [body[key], entry]
        else body[key] = entry
        continue
      }
      const file = entry as File
      if (file.size === 0 && !file.name) continue
      ;(files[key] ||= []).push({ name: file.name, type: file.type, size: file.size, data: new Uint8Array(await file.arrayBuffer()) })
    }
    // The browser sends every non-file answer as one JSON part, so structured
    // answers (matrix, address) survive a multipart request intact.
    if (typeof body.eg_json === 'string' && body.eg_json.length <= MAX_JSON_BYTES) {
      try {
        const parsedJson = JSON.parse(body.eg_json)
        delete body.eg_json
        if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) Object.assign(body, parsedJson)
      } catch {
        return { error: json({ ok: false, message: 'That request could not be read.' }, 400) }
      }
    } else {
      delete body.eg_json
    }
    return { body, files }
  }

  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) return { error: json({ ok: false, message: 'That request is too large.' }, 413) }
  // Stream-read with a cap: a missing or lying Content-Length must not let a huge body through.
  let text = ''
  if (request.body) {
    const reader = request.body.getReader()
    const decoder = new TextDecoder()
    let total = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_JSON_BYTES) {
          await reader.cancel().catch((): void => undefined)
          return { error: json({ ok: false, message: 'That request is too large.' }, 413) }
        }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
    } catch {
      text = ''
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body: Record<string, unknown> = {}
    for (const [key, value] of new URLSearchParams(text).entries()) {
      if (key in body) body[key] = Array.isArray(body[key]) ? [...(body[key] as unknown[]), value] : [body[key], value]
      else body[key] = value
    }
    return { body, files: {} }
  }

  // JSON, including a text/plain body (a "simple" cross-origin request carries no preflight).
  try {
    const parsed = JSON.parse(text || '{}')
    return { body: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}, files: {} }
  } catch {
    return { error: json({ ok: false, message: 'That request could not be read.' }, 400) }
  }
}

export async function handleSubmitRequest(request: Request, engine: Engine, idOrKey: string): Promise<Response> {
  const { handleSubmission, rateLimitSubmission } = await import('./submit')
  const { formsEnabled } = await import('./settings')

  if (!idOrKey) return json({ ok: false, message: 'Not found' }, 404)
  if (!(await formsEnabled(engine))) return json({ ok: false, message: 'Not found' }, 404)

  const form = await loadForm(engine, idOrKey)
  if (!form || !isPublished(form)) return json({ ok: false, message: 'Not found' }, 404)

  const config = normaliseFormConfig(form.formConfig)
  const url = new URL(request.url)
  const decision = checkOrigin(request.headers.get('origin'), config.embed?.allowedOrigins || [], url.origin)
  const cors = corsHeaders(decision.allowed ? decision.origin : null)

  if (request.method === 'OPTIONS') {
    return decision.allowed ? new Response(null, { status: 204, headers: cors }) : json({ ok: false, message: 'This website may not use this form.' }, 403)
  }

  if (!decision.allowed) return json({ ok: false, message: 'This website may not use this form.' }, 403)

  const limit = await rateLimitSubmission(engine, request, form.id as string | number)
  if (limit.limited) {
    return json({ ok: false, message: 'Too many submissions. Please wait a moment and try again.' }, 429, { ...cors, 'Retry-After': String(limit.retryAfterSeconds) })
  }

  const { resolveUploadPolicy } = await import('@/features/media/fileTypes')
  const sitePolicy = resolveUploadPolicy(await engine.findGlobal({ slug: 'media-settings', depth: 0 }).catch((): null => null))
  const fileFieldCount = (form.fields || []).filter((field) => field.type === 'file' && field.name).length
  const parsed = await parseSubmissionBody(request, fileFieldCount * MAX_FILES_PER_FIELD * sitePolicy.maxBytes)
  if ('error' in parsed) {
    const headers = new Headers(parsed.error.headers)
    for (const [name, value] of Object.entries(cors)) headers.set(name, value)
    return new Response(parsed.error.body, { status: parsed.error.status, headers })
  }

  const {
    [HONEYPOT_FIELD]: honeypot,
    [RENDERED_AT_FIELD]: renderedAt,
    [TURNSTILE_FIELD]: turnstileToken,
    [RECAPTCHA_FIELD]: recaptchaToken,
    eg_source: source,
    ...values
  } = parsed.body

  const outcome = await handleSubmission(engine, {
    formID: idOrKey,
    form,
    values,
    files: parsed.files,
    honeypot,
    renderedAt,
    turnstileToken,
    recaptchaToken,
    // CF-Connecting-IP is set by the edge and cannot be forged; the others are
    // fallbacks for local development, where neither is present.
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    sourceUrl: decision.origin || request.headers.get('referer') || (typeof source === 'string' ? source : undefined) || undefined,
  })

  return json(
    {
      ok: outcome.ok,
      message: outcome.message,
      errors: outcome.errors,
      submissionID: outcome.submissionID,
      redirectUrl: outcome.redirectUrl,
      checkout: outcome.checkout,
    },
    outcome.status,
    cors,
  )
}