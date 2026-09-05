import type { Endpoint, EngineRequest } from '@/engine'

import { HONEYPOT_FIELD, RENDERED_AT_FIELD, TURNSTILE_FIELD } from './spam'

/**
 * POST /api/forms/:id/submit
 *
 * A collection endpoint rather than a route under src/app, so the whole feature
 * - schema, logic and its public surface - lives in one folder and arrives or
 * leaves in one piece.
 *
 * Accepts JSON or multipart form data. Multipart exists because a form can have
 * a file field and a browser without scripting will post that way; see the note
 * on files below for what actually happens to them.
 */

const json = (body: unknown, status: number, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  })

/**
 * Flattens a request body into plain values keyed by field name.
 *
 * Repeated keys - a checkbox group - collapse into an array, because that is
 * how a browser posts them and how the conditional evaluator expects to read
 * them.
 *
 * FILE UPLOADS ARE NOT STORED. A file field renders and validates, and the
 * file's name is recorded with the entry so the owner can see something was
 * attached, but the bytes are discarded. Storing them means writing to R2 and
 * deciding who may read them back afterwards - a form attachment is not public
 * the way a Media item is - and that access model is a decision about Media,
 * not about forms. Marked here rather than silently dropped.
 */
const readBody = async (req: EngineRequest): Promise<Record<string, unknown>> => {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json?.().catch((): null => null)
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  }

  const form = await (req as unknown as Request).formData().catch((): null => null)
  if (!form) return {}

  const values: Record<string, unknown> = {}
  for (const [key, entry] of form.entries()) {
    const value = typeof entry === 'string' ? entry : (entry as File).name
    if (key in values) {
      const existing = values[key]
      values[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
    } else {
      values[key] = value
    }
  }
  return values
}

export const submitEndpoint: Endpoint = {
  path: '/:id/submit',
  method: 'post',
  handler: async (req: EngineRequest): Promise<Response> => {
    const formID = (req.routeParams?.id ?? '') as string
    if (!formID) return json({ ok: false, message: 'Not found' }, 404)

    const request = req as unknown as Request

    // Deferred so the collection config - which carries this endpoint - does
    // not statically depend on the submission pipeline. See settings.ts.
    const { handleSubmission, rateLimitSubmission } = await import('./submit')
    const engine = req.payload as unknown as Parameters<typeof handleSubmission>[0]

    const limit = await rateLimitSubmission(engine, request, formID)
    if (limit.limited) {
      return json({ ok: false, message: 'Too many submissions. Please wait a moment and try again.' }, 429, {
        'Retry-After': String(limit.retryAfterSeconds),
      })
    }

    const body = await readBody(req)

    const {
      [HONEYPOT_FIELD]: honeypot,
      [RENDERED_AT_FIELD]: renderedAt,
      [TURNSTILE_FIELD]: turnstileToken,
      ...values
    } = body

    const outcome = await handleSubmission(engine, {
      formID,
      values,
      honeypot,
      renderedAt,
      turnstileToken,
      // CF-Connecting-IP is set by the edge and cannot be forged; the others are
      // fallbacks for local development, where neither is present.
      ip:
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-real-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        undefined,
      userAgent: req.headers.get('user-agent') || undefined,
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
    )
  },
}
