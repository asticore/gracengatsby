import type { FormDoc, SubmissionValues } from './types'

import { clientKey, getSecuritySettings, hit, limitFor } from '@/features/security'

import { sanitiseValues } from './conditions'
import { summarise, sendSubmissionEmails } from './notify'
import { buildCheckoutHandoff, priceSubmission, type CheckoutHandoff } from './pricing'
import { formsEnabled, getFormSettings, resolveForForm } from './settings'
import { FORMS_SLUG, SUBMISSIONS_SLUG, type CreateArgs, type UpdateArgs } from './slugs'
import { checkFillTime, checkHoneypot, checkTurnstile } from './spam'
import { PRESENTATIONAL_TYPES } from './types'

/**
 * Everything that happens between a visitor pressing send and the entry
 * existing. Kept out of the endpoint so the order of operations is readable in
 * one place, and so it can be exercised without an HTTP request.
 *
 * The order matters and is deliberate:
 *
 *   1. feature flag        - nothing at all when Forms is off
 *   2. rate limit          - before any database read, so a flood is cheap
 *   3. load the form       - the only source of truth for what is allowed
 *   4. spam filters        - before validation, so a bot never sees a hint
 *   5. sanitise            - drop hidden fields, recompute calculations
 *   6. validate            - required fields, but only the ones still visible
 *   7. price               - from the sanitised values, never from the request
 *   8. store               - with overrideAccess, having earned it above
 *   9. notify              - last, because it can fail without costing the entry
 *
 * The engine is passed in rather than imported: see the note in settings.ts on
 * why nothing in this feature may reach for `@/lib/engine`.
 */

/** The engine surface a submission needs. `req.payload` satisfies it. */
export type SubmitEngine = {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: CreateArgs) => Promise<{ id?: number | string }>
  update: (args: UpdateArgs) => Promise<unknown>
  findGlobal: (args: { slug: string; depth?: number }) => Promise<Record<string, unknown>>
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
}

export type SubmitOutcome = {
  ok: boolean
  status: number
  /** Safe to show a visitor. */
  message?: string
  /** Field name to error mapping, for inline messages. */
  errors?: Record<string, string>
  submissionID?: number | string
  redirectUrl?: string
  checkout?: CheckoutHandoff
}

export type SubmitInput = {
  formID: string | number
  values: SubmissionValues
  honeypot?: unknown
  renderedAt?: unknown
  turnstileToken?: unknown
  ip?: string
  userAgent?: string
}

const GENERIC_REJECTION = 'Your message could not be sent. Please try again.'

const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'boolean') return value === false
  return String(value).trim() === ''
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Required-field and format checks, over the fields that survived the logic. */
function validate(form: FormDoc, values: SubmissionValues, visible: Set<string>): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of form.fields || []) {
    if (!field?.name || PRESENTATIONAL_TYPES.includes(field.type)) continue
    if (field.type === 'calculation') continue
    if (!visible.has(field.name)) continue

    const value = values[field.name]

    if (field.required && isBlank(value)) {
      errors[field.name] = `${field.label || field.name} is required.`
      continue
    }

    if (isBlank(value)) continue

    if (field.type === 'email' && !EMAIL_PATTERN.test(String(value).trim())) {
      errors[field.name] = 'That does not look like an email address.'
    }

    if (field.type === 'number') {
      const parsed = Number(String(value).replace(/[^0-9.+-]/g, ''))
      if (!Number.isFinite(parsed)) {
        errors[field.name] = 'Please enter a number.'
      } else if (typeof field.min === 'number' && parsed < field.min) {
        errors[field.name] = `Must be ${field.min} or more.`
      } else if (typeof field.max === 'number' && parsed > field.max) {
        errors[field.name] = `Must be ${field.max} or less.`
      }
    }
  }

  return errors
}

export async function handleSubmission(engine: SubmitEngine, input: SubmitInput): Promise<SubmitOutcome> {
  if (!(await formsEnabled(engine))) {
    // 404 rather than 403: with the feature off, this endpoint should look like
    // it does not exist, matching how the storefront routes behave.
    return { ok: false, status: 404, message: 'Not found' }
  }

  const form = (await engine
    .findByID({ collection: FORMS_SLUG, id: input.formID, depth: 0 })
    .catch((): null => null)) as FormDoc | null

  if (!form) return { ok: false, status: 404, message: 'Not found' }

  const settings = resolveForForm(form, await getFormSettings(engine))

  const honeypot = checkHoneypot(input.honeypot, settings.honeypot)
  if (honeypot.spam) {
    engine.logger.info({ form: form.id, reason: honeypot.reason }, 'Form submission discarded as spam')
    // 200 with the ordinary success message: a bot told it was blocked learns
    // to work around the block. A person can never see this path.
    return { ok: true, status: 200, message: settings.successMessage }
  }

  const fillTime = checkFillTime(input.renderedAt, settings.minimumFillTimeSeconds)
  if (fillTime.spam) {
    engine.logger.info(
      { form: form.id, reason: fillTime.reason, detail: fillTime.detail },
      'Form submission discarded as spam',
    )
    return { ok: true, status: 200, message: settings.successMessage }
  }

  const turnstile = await checkTurnstile(input.turnstileToken, settings, input.ip)
  if (turnstile.spam) {
    return { ok: false, status: 400, message: 'Please complete the challenge and try again.' }
  }
  if (turnstile.reason === 'turnstile-unavailable') {
    engine.logger.warn(
      { form: form.id, detail: turnstile.detail },
      'Turnstile could not be checked - the submission was let through',
    )
  }

  const { values, visible } = sanitiseValues(form.fields || [], input.values || {})

  const errors = validate(form, values, visible)
  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 400, message: 'Please check the highlighted fields.', errors }
  }

  const pricing = priceSubmission(form, values, visible)

  let submissionID: number | string | undefined

  if (settings.storeSubmissions) {
    try {
      const created = await engine.create({
        collection: SUBMISSIONS_SLUG,
        // Earned: the checks above are the access control for this write, and
        // the collection itself refuses public creates precisely so that this
        // is the only way in.
        overrideAccess: true,
        data: {
          form: form.id,
          summary: summarise(form, values),
          values,
          submittedAt: new Date().toISOString(),
          ip: input.ip,
          userAgent: input.userAgent,
          total: pricing.total || undefined,
          currency: pricing.total ? pricing.currency : undefined,
          lineItems: pricing.lines.length ? pricing.lines : undefined,
          paymentStatus: form.payment?.purchasable && pricing.total > 0 ? 'unpaid' : 'none',
        },
      } as unknown as CreateArgs)
      submissionID = created?.id
    } catch (error) {
      engine.logger.error({ err: error, form: form.id }, 'A form entry could not be stored')
      return { ok: false, status: 500, message: settings.errorMessage || GENERIC_REJECTION }
    }
  }

  const emails = await sendSubmissionEmails(form, values, settings, pricing)

  if (submissionID && (emails.notification || emails.confirmation)) {
    const status = [
      emails.notification ? `notification ${emails.notification}` : '',
      emails.confirmation ? `confirmation ${emails.confirmation}` : '',
    ]
      .filter(Boolean)
      .join('; ')

    // Best-effort: the entry already exists, and failing the request now would
    // tell the visitor their message did not arrive when it did.
    await engine
      .update({
        collection: SUBMISSIONS_SLUG,
        id: submissionID,
        overrideAccess: true,
        data: { notificationStatus: status },
      } as unknown as UpdateArgs)
      .catch((error: unknown) => {
        engine.logger.warn({ err: error }, 'Could not record the email status on a form entry')
      })
  }

  return {
    ok: true,
    status: 200,
    message: settings.successMessage,
    submissionID,
    redirectUrl: form.settings?.redirectUrl || undefined,
    checkout: form.payment?.purchasable ? buildCheckoutHandoff(form, pricing, submissionID) : undefined,
  }
}

/**
 * The rate-limit decision for one submission.
 *
 * Uses the Security feature's limiter so forms share the same budget and the
 * same caveats as everything else - read the note at the top of rateLimit.ts
 * before trusting the number. Keyed per form as well as per client so a busy
 * newsletter signup cannot exhaust the allowance for the contact form.
 */
export async function rateLimitSubmission(
  engine: SubmitEngine,
  request: Request,
  formID: string | number,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const security = await getSecuritySettings(engine)
  const limit = limitFor(security, 'form')

  if (!limit) return { limited: false, retryAfterSeconds: 0 }

  const decision = hit(`form:${formID}:${clientKey(request)}`, limit)
  return { limited: decision.limited, retryAfterSeconds: decision.retryAfterSeconds }
}
