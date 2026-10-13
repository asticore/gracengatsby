import type { FormDoc, FormFieldDef, SubmissionValues } from './types'

import { clientKey, getSecuritySettings, hit, limitFor } from '@/features/security'
import { resolveUploadPolicy } from '@/features/media/fileTypes'

import { normaliseFormConfig } from './config'
import { sanitiseValues } from './conditions'
import { isPublished, withResolvedFields } from './layout'
import { summarise, sendSubmissionEmails } from './notify'
import { buildCheckoutHandoff, priceSubmission, type CheckoutHandoff } from './pricing'
import { formsEnabled, getFormSettings, resolveForForm } from './settings'
import { loadForm } from './server'
import { FORMS_SLUG, SUBMISSIONS_SLUG, type CreateArgs, type UpdateArgs } from './slugs'
import { SLOT_TAKEN_MESSAGE } from './slots'
import { firstLostSlot, firstTakenSlot, slotClaimsFor } from './slotGuard'
import { checkCaptcha, checkFillTime, checkHoneypot } from './spam'
import { inspectFiles, storeFiles, getUploadBucket, type PendingFile, type StoredFile } from './upload'
import { validateSubmission } from './validate'
import { buildPayload, deliver, summariseAttempts, type WebhookAttempt } from './webhooks'

/**
 * Everything that happens between a visitor pressing send and the entry
 * existing. Kept out of the endpoint so the order of operations is readable in
 * one place, and so it can be exercised without an HTTP request.
 *
 * The order matters and is deliberate:
 *
 *   1. feature flag        - nothing at all when Forms is off
 *   2. load the form       - the only source of truth for what is allowed
 *   3. spam filters        - before validation, so a bot never sees a hint
 *   4. sanitise            - drop hidden fields, recompute calculations
 *   5. validate            - every field type, but only the ones still visible
 *   6. inspect files       - type and size against the allow-list, from the bytes
 *   7. price               - from the sanitised values, never from the request
 *   8. store the files     - to R2, only once the answers are known to be good
 *   9. store the entry     - with overrideAccess, having earned it above
 *  10. notify + webhooks   - last, because they can fail without costing the entry
 *
 * (The caller has already checked the origin and the rate limit.)
 *
 * The engine is passed in rather than imported: see the note in settings.ts on
 * why nothing in this feature may reach for `@/lib/engine`.
 */

/** The engine surface a submission needs. `req.engine` satisfies it. */
export type SubmitEngine = {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  create: (args: CreateArgs) => Promise<{ id?: number | string }>
  update: (args: UpdateArgs) => Promise<unknown>
  /** Used only to take back an appointment entry that lost a race for its slot. */
  delete?: (args: Record<string, unknown>) => Promise<unknown>
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
  /** Numeric id or embed key. Ignored when `form` is given. */
  formID: string | number
  /** The form, when the caller already loaded it. */
  form?: FormDoc | null
  values: SubmissionValues
  /** Files by field name, already read from a multipart body. */
  files?: Record<string, PendingFile[]>
  honeypot?: unknown
  renderedAt?: unknown
  turnstileToken?: unknown
  recaptchaToken?: unknown
  ip?: string
  userAgent?: string
  /** Where the form was sent from: the embedding site's origin or the page URL. */
  sourceUrl?: string
  now?: Date
  /** Test seam: replaces the R2 binding. */
  bucket?: Parameters<typeof storeFiles>[0]
  /** Test seam: replaces fetch for webhooks and captcha. */
  fetcher?: typeof fetch
}

const GENERIC_REJECTION = 'Your message could not be sent. Please try again.'

/** Marks the consent answers, with the time, as the record of what was agreed. */
function consentRecord(fields: FormFieldDef[], values: SubmissionValues, at: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  for (const field of fields) {
    if (field.type !== 'consent' || !field.name) continue
    if (values[field.name] !== true) continue
    records.push({
      field: field.name,
      text: (field.label || '').slice(0, 500),
      link: field.consentLink || undefined,
      at,
    })
  }
  return records
}

export async function handleSubmission(engine: SubmitEngine, input: SubmitInput): Promise<SubmitOutcome> {
  if (!(await formsEnabled(engine))) {
    // 404 rather than 403: with the feature off, this endpoint should look like
    // it does not exist, matching how the storefront routes behave.
    return { ok: false, status: 404, message: 'Not found' }
  }

  const rawForm = input.form ?? (await loadForm(engine, input.formID))
  // A draft form does not exist as far as the public is concerned.
  if (!rawForm || !isPublished(rawForm)) return { ok: false, status: 404, message: 'Not found' }

  const form = withResolvedFields(rawForm)
  const config = normaliseFormConfig(form.formConfig)
  const settings = resolveForForm(form, await getFormSettings(engine))
  const now = input.now || new Date()

  const honeypot = checkHoneypot(input.honeypot, settings.honeypot)
  if (honeypot.spam) {
    engine.logger.info({ form: form.id, reason: honeypot.reason }, 'Form submission discarded as spam')
    // 200 with the ordinary success message: a bot told it was blocked learns
    // to work around the block. A person can never see this path.
    return { ok: true, status: 200, message: settings.successMessage }
  }

  const fillTime = checkFillTime(input.renderedAt, settings.minimumFillTimeSeconds, now.getTime())
  if (fillTime.spam) {
    engine.logger.info({ form: form.id, reason: fillTime.reason, detail: fillTime.detail }, 'Form submission discarded as spam')
    return { ok: true, status: 200, message: settings.successMessage }
  }

  const captcha = await checkCaptcha({ turnstile: input.turnstileToken, recaptcha: input.recaptchaToken }, settings, input.ip)
  if (captcha.spam) {
    return { ok: false, status: 400, message: 'Please complete the challenge and try again.' }
  }
  if (captcha.reason === 'turnstile-unavailable') {
    engine.logger.warn({ form: form.id, detail: captcha.detail }, 'The captcha could not be checked - the submission was let through')
  }

  const { values: sanitised, visible } = sanitiseValues(form.fields || [], input.values || {})

  const { errors, values } = validateSubmission(form.fields || [], sanitised, visible, now)

  // Files: any value the request sent for a file field is dropped - only what
  // we store from the uploaded bytes may appear in an entry.
  const fileFields = (form.fields || []).filter((field) => field.type === 'file' && field.name)
  const toStore: { name: string; files: ReturnType<typeof inspectFiles>['ok'] }[] = []
  if (fileFields.length > 0) {
    const sitePolicy = resolveUploadPolicy(await engine.findGlobal({ slug: 'media-settings', depth: 0 }).catch((): null => null))
    for (const field of fileFields) {
      delete values[field.name!]
      if (!visible.has(field.name!)) continue
      const pending = input.files?.[field.name!] || []
      if (pending.length === 0) {
        if (field.required) errors[field.name!] = `${field.label || field.name} is required.`
        continue
      }
      const inspected = inspectFiles(field, pending, sitePolicy)
      if (inspected.error) errors[field.name!] = inspected.error
      else toStore.push({ name: field.name!, files: inspected.ok })
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 400, message: 'Please check the highlighted fields.', errors }
  }

  // Double-booking: a full appointment slot is refused before anything is stored.
  const slotClaims = settings.storeSubmissions ? slotClaimsFor(form.fields || [], values, visible) : []
  const takenField = slotClaims.length > 0 ? await firstTakenSlot(engine, Number(form.id), slotClaims) : null
  if (takenField) {
    return { ok: false, status: 400, message: 'Please check the highlighted fields.', errors: { [takenField]: SLOT_TAKEN_MESSAGE } }
  }

  const pricing = priceSubmission(form, values, visible)

  // Files are only kept when the entry that owns them is kept; otherwise they
  // would sit in R2 with nothing pointing at them.
  if (toStore.length > 0 && settings.storeSubmissions) {
    try {
      const bucket = input.bucket || (await getUploadBucket())
      for (const entry of toStore) {
        values[entry.name] = (await storeFiles(bucket, form.id as string | number, entry.files || [], now)) as StoredFile[]
      }
    } catch (error) {
      engine.logger.error({ err: error, form: form.id }, 'A form attachment could not be stored')
      return { ok: false, status: 500, message: settings.errorMessage || GENERIC_REJECTION }
    }
  }

  const submittedAt = now.toISOString()
  const consent = consentRecord(form.fields || [], values, submittedAt)
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
          submittedAt,
          ip: input.ip,
          userAgent: input.userAgent,
          sourceUrl: input.sourceUrl ? input.sourceUrl.slice(0, 500) : undefined,
          consent: consent.length ? consent : undefined,
          status: 'new',
          total: pricing.total || undefined,
          currency: pricing.total ? pricing.currency : undefined,
          lineItems: pricing.lines.length ? pricing.lines : undefined,
          paymentStatus: form.payment?.purchasable && pricing.total > 0 ? 'unpaid' : 'none',
        },
      } as unknown as CreateArgs)
      submissionID = created?.id
    } catch (error) {
      engine.logger.error({ err: error, form: form.id }, 'A form entry could not be stored')
      if (toStore.length > 0) {
        const { deleteEntryFiles } = await import('./maintenance')
        await deleteEntryFiles(values, input.bucket as unknown as Parameters<typeof deleteEntryFiles>[1]).catch((): number => 0)
      }
      return { ok: false, status: 500, message: settings.errorMessage || GENERIC_REJECTION }
    }

    // Second check, after the insert: a racing request may have taken the last place.
    const lostField =
      slotClaims.length > 0 && submissionID !== undefined ? await firstLostSlot(engine, Number(form.id), slotClaims, Number(submissionID)) : null
    if (lostField) {
      await engine.delete?.({ collection: SUBMISSIONS_SLUG, id: Number(submissionID), overrideAccess: true }).catch((error: unknown) => {
        engine.logger.error({ err: error, form: form.id }, 'A form entry that lost its appointment slot could not be removed')
      })
      if (toStore.length > 0) {
        const { deleteEntryFiles } = await import('./maintenance')
        await deleteEntryFiles(values, input.bucket as unknown as Parameters<typeof deleteEntryFiles>[1]).catch((): number => 0)
      }
      return { ok: false, status: 400, message: 'Please check the highlighted fields.', errors: { [lostField]: SLOT_TAKEN_MESSAGE } }
    }
  }

  const emails = await sendSubmissionEmails(form, values, settings, pricing, { entryId: submissionID, submittedAt })

  // In parallel so one slow endpoint does not hold the visitor up for the sum
  // of them all. A failed delivery is recorded and retried by the cron.
  const settled = await Promise.allSettled(
    (config.webhooks || [])
      .filter((hook) => hook.enabled !== false && hook.url)
      .map((hook) => {
        const payload = buildPayload(form, form.fields || [], submissionID, values, submittedAt, `${submissionID ?? 'x'}-${hook.id}-1`)
        return deliver(hook, payload, 1, input.fetcher)
      }),
  )
  const attempts: WebhookAttempt[] = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

  if (submissionID) {
    const statusParts = [
      emails.notification ? `notification ${emails.notification}` : '',
      ...(emails.rules || []).map((line) => `rule ${line}`),
      emails.confirmation ? `confirmation ${emails.confirmation}` : '',
    ].filter(Boolean)

    const webhook = summariseAttempts(attempts)
    const patch: Record<string, unknown> = {}
    if (statusParts.length) patch.notificationStatus = statusParts.join('; ').slice(0, 1000)
    if (attempts.length) {
      patch.webhookDeliveries = attempts
      patch.webhookState = webhook.state
      patch.webhookRetryAt = webhook.retryAt || undefined
    }

    if (Object.keys(patch).length > 0) {
      // Best-effort: the entry already exists, and failing the request now would
      // tell the visitor their message did not arrive when it did.
      await engine
        .update({ collection: SUBMISSIONS_SLUG, id: submissionID, overrideAccess: true, data: patch } as unknown as UpdateArgs)
        .catch((error: unknown) => {
          engine.logger.warn({ err: error }, 'Could not record the delivery status on a form entry')
        })
    }
  }

  return {
    ok: true,
    status: 200,
    message: settings.successMessage,
    submissionID,
    redirectUrl: (config.success?.mode === 'redirect' && config.success.redirectUrl) || form.settings?.redirectUrl || undefined,
    checkout: form.payment?.purchasable ? buildCheckoutHandoff(form, pricing, submissionID) : undefined,
  }
}

/** Per-client, per-form ceiling used when the Security feature has no form limit of its own. */
export const FALLBACK_FORM_LIMIT_PER_MINUTE = 30

/**
 * The rate-limit decision for one submission.
 *
 * Uses the Security feature's limiter so forms share the same budget and the
 * same caveats as everything else - read the note at the top of rateLimit.ts
 * before trusting the number. Keyed per form as well as per client so a busy
 * newsletter signup cannot exhaust the allowance for the contact form. When
 * the Security feature is off (or has no form limit) a fallback still applies:
 * an embeddable endpoint must never be completely unmetered.
 */
export async function rateLimitSubmission(
  engine: SubmitEngine,
  request: Request,
  formID: string | number,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const security = await getSecuritySettings(engine as never)
  const limit = limitFor(security, 'form') ?? FALLBACK_FORM_LIMIT_PER_MINUTE

  const decision = hit(`form:${formID}:${clientKey(request)}`, limit)
  return { limited: decision.limited, retryAfterSeconds: decision.retryAfterSeconds }
}

export { FORMS_SLUG }
