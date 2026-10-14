import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'

import type { EmailSettingsDoc, OutgoingEmail, SendEmailArgs, SendEmailResult } from './types'

import { loadEmailSettings } from './connectionLoad'
import { planAttempts, sendWithFailover } from './failover'
import { isSupportedProvider } from './providers'
import { recordEmailSend } from './emailLogStore'
import { SCHEDULE_GLOBAL_SLUG, isTemplateEnabled, scheduleKeyFor, type EmailScheduleDoc } from './schedule'

export type { SendEmailArgs, SendEmailResult, EmailProviderKey } from './types'

/**
 * The whole of email's public surface: `sendEmail` for anything that needs to
 * send, `sendTestEmail` for the button on the settings screen. Forms, members
 * and backups import from here and nothing deeper, so provider adapters can be
 * added or reworked without touching a single caller.
 */

const RECIPIENT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const toRecipients = (to: SendEmailArgs['to']): string[] =>
  (Array.isArray(to) ? to : [to]).map((address) => address.trim()).filter((address) => address.length > 0)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Builds the message that will actually go out, folding in the from-name,
 * from-address and default reply-to held in settings.
 *
 * Returns the reason instead of the message when something required is missing,
 * so the caller reports one clear problem rather than letting the provider
 * reject a half-formed message later.
 */
type Prepared = {
  message: OutgoingEmail | null
  reason?: 'invalid-message' | 'not-configured'
  error?: string
}

const prepare = (args: SendEmailArgs, settings: EmailSettingsDoc): Prepared => {
  const to = toRecipients(args.to)
  if (to.length === 0) return { message: null, reason: 'invalid-message', error: 'No recipient was given.' }

  const invalid = to.filter((address) => !RECIPIENT_PATTERN.test(address))
  if (invalid.length > 0) {
    return { message: null, reason: 'invalid-message', error: `Not a valid email address: ${invalid.join(', ')}` }
  }

  const subject = text(args.subject)
  if (!subject) return { message: null, reason: 'invalid-message', error: 'The message has no subject.' }

  const html = text(args.html)
  const plain = text(args.text)
  if (!html && !plain) return { message: null, reason: 'invalid-message', error: 'The message has no content.' }

  const fromEmail = text(settings.fromEmail)
  if (!fromEmail) {
    return {
      message: null,
      reason: 'not-configured',
      error: 'No sending address is set. Add one under Settings > Email.',
    }
  }

  return {
    message: {
      to,
      subject,
      ...(html ? { html } : {}),
      ...(plain ? { text: plain } : {}),
      fromEmail,
      fromName: text(settings.fromName) || undefined,
      replyTo: text(args.replyTo) || text(settings.replyToEmail) || undefined,
    },
  }
}

/**
 * Sends one message through whichever provider is configured.
 *
 * Never throws. Everything that can go wrong - the feature being off, a
 * half-filled settings screen, an unreachable provider, a provider that says no
 * - comes back as a structured result, because the callers are request handlers
 * doing something else (saving a form entry, registering a member, finishing a
 * backup) and a failure to notify must not fail the thing that was actually
 * being done.
 */
const deliverEmail = async (args: SendEmailArgs): Promise<SendEmailResult> => {
  const engine = await getEngine()
  const logger = engine.logger

  try {
    const flags = await getFeatureFlags()
    if (!flags.email) {
      return {
        ok: false,
        reason: 'disabled',
        error: 'Email is switched off for this site. Turn it on under Site Settings to send.',
      }
    }

    // Keys come from the Integrations page (communications group), with the old
    // Email settings fields behind them for sites that have not re-saved yet.
    const settings: EmailSettingsDoc = await loadEmailSettings(engine as unknown as Parameters<typeof loadEmailSettings>[0])

    const provider = text(settings.provider)
    if (!isSupportedProvider(provider)) {
      return {
        ok: false,
        reason: 'unsupported-provider',
        error: provider
          ? `"${provider}" cannot send email from this site. Choose a provider under Settings > Email.`
          : 'No email provider has been chosen yet.',
      }
    }

    const prepared = prepare(args, settings)
    if (!prepared.message) {
      return { ok: false, reason: prepared.reason, error: prepared.error, provider }
    }

    // Default first; the fallback is tried only after a transient failure.
    const plan = planAttempts(settings)
    if (plan.attempts.length === 0) {
      return {
        ok: false,
        reason: 'not-configured',
        provider,
        error: `Still missing: ${plan.missing.join(', ')}.`,
      }
    }

    const result = await sendWithFailover(prepared.message, plan.attempts)

    if (!result.ok) {
      logger.error(
        { provider: result.provider, status: result.status, reason: result.error, to: prepared.message.to.length },
        'Email provider refused the message',
      )
      return result
    }

    logger.info({ provider: result.provider, id: result.id, to: prepared.message.to.length }, 'Email sent')
    return result
  } catch (error) {
    // The adapters already convert their own failures, so reaching here means
    // something upstream broke - reading settings or the flags. Still a result,
    // never an exception thrown at whoever was only trying to notify someone.
    const message = error instanceof Error ? error.message : String(error)
    logger.error({ err: error }, 'Email could not be sent')
    return { ok: false, reason: 'provider-rejected', error: message }
  }
}

/**
 * Sends one message and records the attempt in the email log. The log write is
 * awaited so it is not dropped when the request ends, but it never throws, and
 * a send the feature has switched off is not logged at all.
 */
export const sendEmail = async (args: SendEmailArgs): Promise<SendEmailResult> => {
  const result: SendEmailResult = (await scheduleHolds(args))
    ? { ok: false, reason: 'turned-off', error: 'Turned off under Settings > Communication > When emails are sent.' }
    : await deliverEmail(args)
  await recordEmailSend(args, result)
  return result
}

/**
 * True when the `email-schedule` switch for this kind of email is off. Only the
 * emails the schedule governs are read at all. A schedule that cannot be read
 * falls back to the defaults, so an unreadable row never sends an email that is
 * switched off, and never blocks a password reset.
 */
const scheduleHolds = async (args: SendEmailArgs): Promise<boolean> => {
  const key = scheduleKeyFor(args.template, args.resentFrom)
  if (!key) return false
  let schedule: EmailScheduleDoc | null = null
  try {
    const engine = await getEngine()
    schedule = (await engine.findGlobal({ slug: SCHEDULE_GLOBAL_SLUG, depth: 0 })) as EmailScheduleDoc
  } catch {
    schedule = null
  }
  return !isTemplateEnabled(schedule, key)
}

/**
 * Sends the fixed message behind the "Send test email" button, to the test
 * recipient stored in settings. Kept here rather than in the API route so the
 * route stays a thin guard and this stays testable without HTTP.
 */
export const sendTestEmail = async (): Promise<SendEmailResult & { to?: string }> => {
  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'email-settings', depth: 0 })) as EmailSettingsDoc
  const recipient = text(settings.testing?.testRecipient)

  if (!recipient) {
    return {
      ok: false,
      reason: 'not-configured',
      error: 'Set a test recipient below, save, then try again.',
    }
  }

  const sent = new Date().toISOString()
  const result = await sendEmail({
    to: recipient,
    template: 'test',
    subject: 'Test message from your site',
    text: `This is a test message confirming your email settings work.\n\nSent ${sent}.`,
    html: `<p>This is a test message confirming your email settings work.</p><p>Sent ${sent}.</p>`,
  })

  return { ...result, to: recipient }
}
