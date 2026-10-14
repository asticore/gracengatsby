import type { SendEmailArgs, SendEmailResult } from './types'

/**
 * The pure half of the email log: what a row looks like, which sends get one,
 * how long rows are kept, and when an entry may be sent again. No database
 * here, so the rules can be tested on their own. The writes live in
 * emailLogStore.ts.
 */

/** The collection the log is kept in (src/collections/EmailLog.ts). */
export const EMAIL_LOG_SLUG = 'email-log'

/** Rows older than this are removed by the cron housekeeping. */
export const EMAIL_LOG_RETENTION_DAYS = 90

/** Longest html or text body kept. A body cut at this length cannot be sent again in full. */
export const BODY_CAP = 60000

const SUBJECT_CAP = 300
const TO_CAP = 500
const ERROR_CAP = 1000
const TEMPLATE_CAP = 60

/** Stored in place of a body that carries a live sign-in link. */
export const NOT_STORED = '[not stored]'

/** Templates whose bodies are never kept, because the body holds a reset or welcome link that works until used. */
export const UNSTORED_TEMPLATES: ReadonlySet<string> = new Set(['account.reset', 'account.welcome'])

/** One resend of the same entry per this many milliseconds. */
export const RESEND_INTERVAL_MS = 60_000

export type EmailLogStatus = 'sent' | 'failed' | 'skipped'

export type EmailLogRow = {
  to: string
  subject: string
  template: string
  provider: string
  status: EmailLogStatus
  error: string
  html: string
  text: string
  resentFrom: number | null
}

/** Cuts a value to a length, with an ellipsis when it had to be shortened. */
export function clip(value: unknown, max: number): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

/** Cuts a body to the cap without a marker, so a full-length body is recognisable later. */
export function clipBody(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, BODY_CAP)
}

/**
 * Which status a send gets in the log, or null when it should not be logged.
 * `disabled` means email is switched off for the site, so nothing was attempted
 * and there is nothing to record.
 */
export function statusFor(result: Pick<SendEmailResult, 'ok' | 'reason'>): EmailLogStatus | null {
  if (result.ok) return 'sent'
  if (result.reason === 'disabled') return null
  if (result.reason === 'provider-rejected') return 'failed'
  return 'skipped'
}

/** The row to store for one send, or null when the send should not be logged. Never throws. */
export function buildLogRow(args: SendEmailArgs, result: SendEmailResult): EmailLogRow | null {
  const status = statusFor(result)
  if (!status) return null

  const template = clip(args.template || 'other', TEMPLATE_CAP) || 'other'
  const unstored = UNSTORED_TEMPLATES.has(template)
  const body = (value: string | undefined): string => (unstored ? (value ? NOT_STORED : '') : clipBody(value))

  const recipients = Array.isArray(args.to) ? args.to.join(', ') : String(args.to ?? '')

  return {
    to: clip(recipients, TO_CAP),
    subject: clip(args.subject, SUBJECT_CAP),
    template,
    provider: clip(result.provider, 40),
    status,
    error: clip(result.error, ERROR_CAP),
    html: body(args.html),
    text: body(args.text),
    resentFrom: typeof args.resentFrom === 'number' ? args.resentFrom : null,
  }
}

/** The ISO time before which rows are old enough to be removed. */
export function retentionCutoff(now: Date, days: number = EMAIL_LOG_RETENTION_DAYS): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

export type ResendRefusal = { status: number; error: string }

/**
 * Why an entry cannot be sent again right now, or null when it can.
 *
 * `lastResentAt` is the time of the most recent resend of this entry, if any.
 * An entry is refused when its body was never kept (a sign-in link), when the
 * body was cut at the cap, when there is nothing to send, or when it was resent
 * within the last minute.
 */
export function resendRefusal(
  row: Pick<EmailLogRow, 'html' | 'text'> | null,
  lastResentAt: string | null,
  nowMs: number,
): ResendRefusal | null {
  if (!row) return { status: 404, error: 'That email does not exist.' }

  if (row.html === NOT_STORED || row.text === NOT_STORED) {
    return { status: 409, error: 'This email held a live sign-in link, so its message was not kept and it cannot be sent again.' }
  }
  if (!row.html && !row.text) {
    return { status: 409, error: 'This entry has no message to send again.' }
  }
  if ((row.html || '').length >= BODY_CAP || (row.text || '').length >= BODY_CAP) {
    return { status: 409, error: 'This message was too long to keep in full, so it cannot be sent again.' }
  }

  if (lastResentAt) {
    const elapsed = nowMs - Date.parse(lastResentAt)
    if (Number.isFinite(elapsed) && elapsed < RESEND_INTERVAL_MS) {
      const wait = Math.ceil((RESEND_INTERVAL_MS - elapsed) / 1000)
      return { status: 429, error: `This email was sent again a moment ago. Wait ${wait} seconds and try again.` }
    }
  }

  return null
}
