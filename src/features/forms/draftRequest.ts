import { normaliseFormConfig } from './config'
import {
  cleanDraftEmail,
  cleanDraftPage,
  draftExpiry,
  hashDraftToken,
  isDraftExpired,
  isDraftToken,
  newDraftToken,
  parseDraftValues,
  resumeLink,
  sanitiseDraftValues,
  serialiseDraftValues,
} from './drafts'
import { findDraftByToken, replaceDraft, type DraftEngine } from './draftStore'
import { checkOrigin, corsHeaders } from './origin'
import { withResolvedFields } from './layout'
import { loadPublishedForm, type LookupEngine } from './server'
import { formsEnabled } from './settings'
import { HONEYPOT_FIELD } from './spam'
import { clientKey, hit } from '@/features/security/rateLimit'

/**
 * POST /api/form-draft - the HTTP side of save and continue. Two jobs on one endpoint:
 *
 *  - save:  { form, email, data, page, pageUrl? }  -> stores a draft and emails the visitor a resume link.
 *           The answer is the same whether or not an email was sent, so the endpoint cannot be used to
 *           find out which addresses have used a form.
 *  - load:  { form, token }                         -> the saved answers, only for a live token for that form.
 *
 * OPTIONS (the CORS preflight) reads the form from ?form=, so an embedded copy on another website can
 * post. Every request, preflight included, is checked against the form's own website allow-list, and
 * the form must have "Allow save and continue" switched on. A honeypot field is answered like a real
 * save, so a bot learns nothing. Rate limits apply per visitor, per address, and per form.
 */

const MAX_BODY_CHARS = 80_000
const SAVE_LIMIT_PER_MINUTE = 6
const EMAIL_LIMIT_PER_MINUTE = 4
const LOAD_LIMIT_PER_MINUTE = 30

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

const GENERIC_SAVED = 'We have emailed you a link to finish this form. The link works for 30 days.'
const NOT_FOUND = { ok: false, message: 'Not found' }

export type DraftRouteEngine = DraftEngine &
  LookupEngine & {
    findGlobal: (args: { slug: string; depth?: number }) => Promise<unknown>
    logger?: { warn: (...args: unknown[]) => void }
  }

export async function handleDraftRequest(request: Request, engine: DraftRouteEngine): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    const form = await loadPublishedForm(engine, url.searchParams.get('form') || '')
    const allowed = form ? normaliseFormConfig((form as { formConfig?: unknown }).formConfig).embed?.allowedOrigins || [] : []
    const decision = checkOrigin(request.headers.get('origin'), allowed, url.origin)
    return decision.allowed ? new Response(null, { status: 204, headers: corsHeaders(decision.origin) }) : json({ ok: false, message: 'This website may not use this form.' }, 403)
  }

  if (!(await formsEnabled(engine))) return json(NOT_FOUND, 404)

  const text = await request.text().catch((): string => '')
  if (text.length > MAX_BODY_CHARS) return json({ ok: false, message: 'That request is too large.' }, 413)
  let parsed: unknown
  try {
    parsed = JSON.parse(text || '{}')
  } catch {
    return json({ ok: false, message: 'That request could not be read.' }, 400)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ ok: false, message: 'That request could not be read.' }, 400)
  const body = parsed as Record<string, unknown>

  const form = await loadPublishedForm(engine, typeof body.form === 'string' || typeof body.form === 'number' ? body.form : '')
  const formRecord = form as (typeof form & { allowSaveForLater?: unknown }) | null
  if (!form || formRecord?.allowSaveForLater !== true) return json(NOT_FOUND, 404)

  const config = normaliseFormConfig(form.formConfig)
  const decision = checkOrigin(request.headers.get('origin'), config.embed?.allowedOrigins || [], url.origin)
  const cors = corsHeaders(decision.allowed ? decision.origin : null)
  if (!decision.allowed) return json({ ok: false, message: 'This website may not use this form.' }, 403, cors)

  const now = new Date()
  const fields = withResolvedFields(form).fields

  // Load: the link's visitor asks for their answers back.
  if (body.token !== undefined) {
    const limit = hit(`form-draft-load:${clientKey(request)}`, LOAD_LIMIT_PER_MINUTE)
    if (limit.limited) return json({ ok: false, message: 'Too many requests. Please wait a moment and try again.' }, 429, { ...cors, 'Retry-After': String(limit.retryAfterSeconds) })
    const row = isDraftToken(body.token) ? await findDraftByToken(engine, form.id as string | number, body.token) : null
    if (!row || isDraftExpired(row.expiresAt, now)) {
      return json({ ok: false, message: 'This link has expired or is not valid. Please start the form again.' }, 404, cors)
    }
    return json({ ok: true, values: sanitiseDraftValues(fields, parseDraftValues(row.dataJson)), page: cleanDraftPage(row.page) }, 200, cors)
  }

  // Honeypot: a bot is told what a person is told, and nothing is stored or sent.
  if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD] !== '') return json({ ok: true, message: GENERIC_SAVED }, 200, cors)

  const limit = hit(`form-draft-save:${clientKey(request)}`, SAVE_LIMIT_PER_MINUTE)
  if (limit.limited) return json({ ok: false, message: 'Too many requests. Please wait a moment and try again.' }, 429, { ...cors, 'Retry-After': String(limit.retryAfterSeconds) })

  const email = cleanDraftEmail(body.email)
  if (!email) return json({ ok: false, message: 'Please check the highlighted fields.', errors: { email: 'Enter a valid email address.' } }, 400, cors)
  const emailLimit = hit(`form-draft-email:${email}`, EMAIL_LIMIT_PER_MINUTE)
  if (emailLimit.limited) return json({ ok: false, message: 'Too many requests. Please wait a moment and try again.' }, 429, { ...cors, 'Retry-After': String(emailLimit.retryAfterSeconds) })

  const dataJson = serialiseDraftValues(sanitiseDraftValues(fields, body.data))
  if (dataJson === null) return json({ ok: false, message: 'There is too much to save. Please send the form instead.' }, 413, cors)

  const token = newDraftToken()
  try {
    await replaceDraft(engine, {
      formID: form.id as string | number,
      email,
      tokenHash: await hashDraftToken(token),
      dataJson,
      page: cleanDraftPage(body.page),
      expiresAt: draftExpiry(now),
      now,
    })
  } catch (error) {
    engine.logger?.warn({ err: error }, 'Could not save a form draft')
    return json({ ok: false, message: 'Your progress could not be saved. Please try again.' }, 500, cors)
  }

  const title = String(form.title || 'your form').replace(/[\r\n]+/g, ' ').slice(0, 120)
  const link = resumeLink({ pageUrl: body.pageUrl, selfOrigin: url.origin, formAddress: `/embed/forms/${form.embedKey || form.id}`, token })
  try {
    const { sendEmail } = await import('@/features/email')
    const sent = await sendEmail({
      to: email,
      subject: `Finish ${title}`,
      text: `Here is your link to finish "${title}":\n\n${link}\n\nThe link works for 30 days. Your answers are not in this email.\n\nIf you did not ask for this, you can ignore this email.`,
    })
    if (!sent.ok) engine.logger?.warn({ reason: sent.reason }, 'A form resume email was not sent')
  } catch (error) {
    engine.logger?.warn({ err: error }, 'A form resume email was not sent')
  }

  return json({ ok: true, message: GENERIC_SAVED }, 200, cors)
}
