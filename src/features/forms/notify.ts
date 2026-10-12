import type { FormDoc, FormFieldDef, FormPricing, ResolvedFormSettings, SubmissionValues } from './types'

import { normaliseFormConfig } from './config'
import { answerFields } from './csv'
import { isFieldVisible } from './conditions'
import { displayValue } from './format'
import { withResolvedFields } from './layout'

/**
 * The emails a submission can produce: the notification to the site owner
 * (one default plus any number of rules that only fire when conditions match)
 * and the auto-reply back to the visitor.
 *
 * None of them is allowed to fail a submission. `sendEmail` already never
 * throws, and the outcome is recorded on the entry instead - an enquiry that
 * arrived but was not emailed is still an enquiry, and the stored entry is the
 * record of it. That is exactly why Form Settings recommends leaving storage on.
 *
 * `sendEmail` is imported when it is first needed rather than at the top of the
 * file. The Email feature reaches for `@/lib/engine`, which imports the config,
 * which imports the Forms collection, which is what pulls this module in - a
 * static import here closes that loop and the config's collections come back
 * undefined. Deferring the import to call time breaks the cycle; see the note
 * in settings.ts.
 *
 * Merge tags in subjects and messages: {{field_name}} for any answer,
 * {{all_fields}} for the table of answers, and {{form_title}}, {{entry_id}},
 * {{submitted_at}}, {{total}}. A tag that matches nothing becomes an empty
 * string so a visitor never receives a literal `{{first_name}}`.
 */
const loadSendEmail = async () => (await import('@/features/email')).sendEmail

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const asText = (value: unknown): string => displayValue(undefined, value)

type Row = { label: string; value: string }

const rowsFor = (form: FormDoc, values: SubmissionValues): Row[] => {
  const defined = answerFields(form)
  const rows: Row[] = defined
    .filter((field) => Object.prototype.hasOwnProperty.call(values, field.name))
    .map((field) => ({ label: field.label || field.name, value: displayValue(field, values[field.name]) }))

  // Anything present in the values but not in the current definitions - a field
  // renamed since, or a hidden field set by the page - still gets shown. The
  // notification is the one place a missing answer costs the owner an enquiry.
  const known = new Set(defined.map((field) => field.name))
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key)) rows.push({ label: key, value: asText(value) })
  }

  return rows
}

const rowsToHtml = (rows: Row[]): string =>
  `<table style="border-collapse:collapse">${rows
    .map(
      (row) =>
        `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(
          row.label,
        )}</th><td style="padding:4px 0">${escapeHtml(row.value).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('')}</table>`

const rowsToText = (rows: Row[]): string =>
  rows.map((row) => `${row.label}: ${row.value}`).join('\n')

export type TemplateExtras = Record<string, string>

/**
 * Substitutes {{field_name}} and {{all_fields}} in an author-written message.
 *
 * Placeholders that match nothing are replaced with an empty string rather than
 * left on screen - a visitor should never receive an email containing
 * `{{first_name}}` because the field was renamed. `extras` carries the
 * non-answer tags (form_title, entry_id, ...); an answer with the same key wins.
 */
export function renderTemplate(
  template: string,
  values: SubmissionValues,
  rows: Row[],
  html: boolean,
  extras: TemplateExtras = {},
): string {
  const body = template.replace(/\{\{\s*([a-zA-Z0-9_\- ]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim()
    if (key === 'all_fields') return html ? rowsToHtml(rows) : rowsToText(rows)
    const own = Object.prototype.hasOwnProperty.call(values, key)
    const value = own ? asText(values[key]) : Object.prototype.hasOwnProperty.call(extras, key) ? extras[key] : ''
    return html ? escapeHtml(value) : value
  })

  return html ? body.replace(/\n/g, '<br>') : body
}

const splitRecipients = (value: string): string[] =>
  (value || '')
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
    .slice(0, 20)

export type NotifyResult = {
  notification?: string
  confirmation?: string
  /** One line per conditional notification that fired or failed. */
  rules?: string[]
}

export type NotifyContext = {
  entryId?: number | string
  submittedAt?: string
  fieldsOverride?: FormFieldDef[]
  sendEmail?: (args: { to: string | string[]; subject: string; html: string; text: string; replyTo?: string }) => Promise<{ ok: boolean; error?: string; reason?: string }>
}

/** Does a notification rule's own condition match these answers? No conditions means always. */
export function ruleMatches(
  conditions: { enabled?: boolean; match?: 'all' | 'any'; rules?: { field?: string; operator?: string; value?: string }[] } | undefined,
  values: SubmissionValues,
): boolean {
  if (!conditions?.enabled || !conditions.rules?.length) return true
  // Reuses the field-visibility engine: a rule that "shows" its notification when it matches.
  return isFieldVisible({ conditional: { ...conditions, action: 'show' } } as FormFieldDef, values)
}

/**
 * Sends every email a submission earns and reports what happened, in one short
 * string per email suitable for storing on the entry and reading in the list.
 */
export async function sendSubmissionEmails(
  formInput: FormDoc,
  values: SubmissionValues,
  settings: ResolvedFormSettings,
  pricing?: FormPricing,
  context: NotifyContext = {},
): Promise<NotifyResult> {
  const form = withResolvedFields(formInput)
  const config = normaliseFormConfig(form.formConfig)
  const rows = rowsFor(form, values)
  if (pricing?.total) {
    rows.push({ label: 'Total', value: `${pricing.currency} ${pricing.total.toFixed(2)}` })
  }

  const extras: TemplateExtras = {
    form_title: form.title || '',
    entry_id: context.entryId !== undefined ? String(context.entryId) : '',
    submitted_at: context.submittedAt || new Date().toISOString(),
    total: pricing?.total ? `${pricing.currency} ${pricing.total.toFixed(2)}` : '',
  }

  const result: NotifyResult = {}
  const sendEmail = context.sendEmail || (await loadSendEmail())

  // The site-wide switch wins: turning notifications off in Settings > Forms
  // must stop every form, not only the ones that did not override it.
  const wantsNotification = settings.sendAdminNotification && form.notification?.enabled !== false
  if (wantsNotification) {
    const to = splitRecipients(form.notification?.recipients || settings.notificationRecipients)

    if (to.length === 0) {
      result.notification = 'skipped: no recipients set'
    } else {
      const subject = form.notification?.subject
        ? renderTemplate(form.notification.subject, values, rows, false, extras)
        : `New submission: ${form.title || 'form'}`

      const message = form.notification?.message

      const sent = await sendEmail({
        to,
        subject,
        html: message
          ? renderTemplate(message, values, rows, true, extras)
          : `<p>A new entry was submitted through <strong>${escapeHtml(form.title || 'your form')}</strong>.</p>${rowsToHtml(rows)}`,
        text: message
          ? renderTemplate(message, values, rows, false, extras)
          : `A new entry was submitted through ${form.title || 'your form'}.\n\n${rowsToText(rows)}`,
        // So hitting reply goes to the person who wrote in, when the form
        // captured an address to reply to.
        replyTo: findReplyTo(form, values),
      })

      result.notification = sent.ok ? 'sent' : `failed: ${sent.error || sent.reason}`
    }
  }

  // Notifications that only go out when their conditions match, e.g. "sales@ when budget > 5000".
  const ruleLines: string[] = []
  for (const rule of config.notifications || []) {
    if (!rule || rule.enabled === false) continue
    if (!ruleMatches(rule.conditions, values)) continue
    const to = splitRecipients(rule.recipients || '')
    if (to.length === 0) {
      ruleLines.push(`${rule.name}: skipped, no recipients`)
      continue
    }
    const sent = await sendEmail({
      to,
      subject: rule.subject ? renderTemplate(rule.subject, values, rows, false, extras) : `${rule.name}: ${form.title || 'form'}`,
      html: rule.message
        ? renderTemplate(rule.message, values, rows, true, extras)
        : `<p>A new entry was submitted through <strong>${escapeHtml(form.title || 'your form')}</strong>.</p>${rowsToHtml(rows)}`,
      text: rule.message
        ? renderTemplate(rule.message, values, rows, false, extras)
        : `A new entry was submitted through ${form.title || 'your form'}.\n\n${rowsToText(rows)}`,
      replyTo: findReplyTo(form, values),
    })
    ruleLines.push(`${rule.name}: ${sent.ok ? 'sent' : `failed: ${sent.error || sent.reason}`}`)
  }
  if (ruleLines.length) result.rules = ruleLines

  if (form.confirmation?.enabled) {
    const to = asText(values[form.confirmation.toField || 'email']).trim()

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      result.confirmation = 'skipped: no address in the nominated field'
    } else {
      const subject = form.confirmation.subject
        ? renderTemplate(form.confirmation.subject, values, rows, false, extras)
        : `We received your ${form.title || 'message'}`

      const message = form.confirmation.message

      const sent = await sendEmail({
        to,
        subject,
        html: message
          ? renderTemplate(message, values, rows, true, extras)
          : `<p>Thank you - we have received your ${escapeHtml(form.title || 'message')}. Here is a copy of what you sent:</p>${rowsToHtml(rows)}`,
        text: message
          ? renderTemplate(message, values, rows, false, extras)
          : `Thank you - we have received your ${form.title || 'message'}.\n\n${rowsToText(rows)}`,
      })

      result.confirmation = sent.ok ? 'sent' : `failed: ${sent.error || sent.reason}`
    }
  }

  return result
}

/** The first email field on the form that was actually filled in. */
function findReplyTo(form: FormDoc, values: SubmissionValues): string | undefined {
  for (const field of form.fields || []) {
    if (field?.type !== 'email' || !field.name) continue
    const value = asText(values[field.name]).trim()
    if (value.includes('@')) return value
  }
  return undefined
}

/** A one-line description of an entry, for the admin list column. */
export function summarise(form: FormDoc, values: SubmissionValues): string {
  const parts = rowsFor(form, values)
    .filter((row) => row.value.trim())
    .slice(0, 3)
    .map((row) => `${row.label}: ${row.value}`)

  const line = parts.join(' - ') || 'Empty submission'
  return line.length > 120 ? `${line.slice(0, 117)}...` : line
}
