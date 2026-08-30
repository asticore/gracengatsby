import type { FormDoc, FormPricing, ResolvedFormSettings, SubmissionValues } from './types'

import { answerFields } from './csv'

/**
 * The two emails a submission can produce: the notification to the site owner
 * and the confirmation back to the visitor.
 *
 * Neither is allowed to fail a submission. `sendEmail` already never throws,
 * and the outcome is recorded on the entry instead - an enquiry that arrived
 * but was not emailed is still an enquiry, and the stored entry is the record
 * of it. That is exactly why Form Settings recommends leaving storage on.
 *
 * `sendEmail` is imported when it is first needed rather than at the top of the
 * file. The Email feature reaches for `@/lib/engine`, which imports the config,
 * which imports the Forms collection, which is what pulls this module in - a
 * static import here closes that loop and the config's collections come back
 * undefined. Deferring the import to call time breaks the cycle; see the note
 * in settings.ts.
 */
const loadSendEmail = async () => (await import('@/features/email')).sendEmail

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(asText).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

type Row = { label: string; value: string }

const rowsFor = (form: FormDoc, values: SubmissionValues): Row[] => {
  const defined = answerFields(form)
  const rows: Row[] = defined
    .filter((field) => Object.prototype.hasOwnProperty.call(values, field.name))
    .map((field) => ({ label: field.label || field.name, value: asText(values[field.name]) }))

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

/**
 * Substitutes {{field_name}} and {{all_fields}} in an author-written message.
 *
 * Placeholders that match nothing are replaced with an empty string rather than
 * left on screen - a visitor should never receive an email containing
 * `{{first_name}}` because the field was renamed.
 */
export function renderTemplate(
  template: string,
  values: SubmissionValues,
  rows: Row[],
  html: boolean,
): string {
  const body = template.replace(/\{\{\s*([a-zA-Z0-9_\- ]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim()
    if (key === 'all_fields') return html ? rowsToHtml(rows) : rowsToText(rows)
    const value = asText(values[key])
    return html ? escapeHtml(value) : value
  })

  return html ? body.replace(/\n/g, '<br>') : body
}

const splitRecipients = (value: string): string[] =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

export type NotifyResult = {
  notification?: string
  confirmation?: string
}

/**
 * Sends both emails and reports what happened, in one short string per email
 * suitable for storing on the entry and reading in the admin list.
 */
export async function sendSubmissionEmails(
  form: FormDoc,
  values: SubmissionValues,
  settings: ResolvedFormSettings,
  pricing?: FormPricing,
): Promise<NotifyResult> {
  const rows = rowsFor(form, values)
  if (pricing?.total) {
    rows.push({ label: 'Total', value: `${pricing.currency} ${pricing.total.toFixed(2)}` })
  }

  const result: NotifyResult = {}
  const sendEmail = await loadSendEmail()

  // The site-wide switch wins: turning notifications off in Settings > Forms
  // must stop every form, not only the ones that did not override it.
  const wantsNotification = settings.sendAdminNotification && form.notification?.enabled !== false
  if (wantsNotification) {
    const to = splitRecipients(form.notification?.recipients || settings.notificationRecipients)

    if (to.length === 0) {
      result.notification = 'skipped: no recipients set'
    } else {
      const subject = form.notification?.subject
        ? renderTemplate(form.notification.subject, values, rows, false)
        : `New submission: ${form.title || 'form'}`

      const message = form.notification?.message

      const sent = await sendEmail({
        to,
        subject,
        html: message
          ? renderTemplate(message, values, rows, true)
          : `<p>A new entry was submitted through <strong>${escapeHtml(form.title || 'your form')}</strong>.</p>${rowsToHtml(rows)}`,
        text: message
          ? renderTemplate(message, values, rows, false)
          : `A new entry was submitted through ${form.title || 'your form'}.\n\n${rowsToText(rows)}`,
        // So hitting reply goes to the person who wrote in, when the form
        // captured an address to reply to.
        replyTo: findReplyTo(form, values),
      })

      result.notification = sent.ok ? 'sent' : `failed: ${sent.error || sent.reason}`
    }
  }

  if (form.confirmation?.enabled) {
    const to = asText(values[form.confirmation.toField || 'email']).trim()

    if (!to || !to.includes('@')) {
      result.confirmation = 'skipped: no address in the nominated field'
    } else {
      const subject = form.confirmation.subject
        ? renderTemplate(form.confirmation.subject, values, rows, false)
        : `We received your ${form.title || 'message'}`

      const message = form.confirmation.message

      const sent = await sendEmail({
        to,
        subject,
        html: message
          ? renderTemplate(message, values, rows, true)
          : `<p>Thank you - we have received your ${escapeHtml(form.title || 'message')}. Here is a copy of what you sent:</p>${rowsToHtml(rows)}`,
        text: message
          ? renderTemplate(message, values, rows, false)
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
