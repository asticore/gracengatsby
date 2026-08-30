import type { EngineQuery } from './entitlement'
import type { MemberSettings, MembershipDoc, MembershipTierDoc } from './types'
import { MEMBERSHIPS_SLUG } from './slugs'

/**
 * The two messages members get: welcome, and "your membership ends soon".
 *
 * The Email feature reaches for `@/lib/engine`, which imports the config, which
 * imports these collections - so it is loaded lazily at call time rather than
 * at module load. This is the same dodge the Forms feature uses for its
 * notifications, and for the same reason.
 */
const loadSendEmail = async () => (await import('@/features/email')).sendEmail

export type EngineWrite = EngineQuery & {
  update(args: {
    collection: string
    id: number | string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }): Promise<unknown>
}

type Recipient = { email?: string | null }

const emailOf = (membership: MembershipDoc): string => {
  const user = membership.user
  if (user && typeof user === 'object') return (user as Recipient).email?.trim() ?? ''
  return ''
}

const nameOf = (tier: MembershipDoc['tier']): string =>
  tier && typeof tier === 'object' ? ((tier as MembershipTierDoc).name ?? '') : ''

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string)

/**
 * Fills the {{tier}}, {{renewsAt}} and {{days}} placeholders an operator can
 * put in the message bodies. Anything unrecognised is left alone rather than
 * blanked, so a typo shows up in the email instead of silently vanishing.
 */
const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole)

const asHtml = (body: string): string =>
  body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n')

export type MemberEmailResult = { sent: boolean; reason?: string }

/**
 * Sends the welcome message once and records that it went.
 *
 * The timestamp is written before the outcome is known to be good, and stays
 * written even on a provider failure, because the alternative - retrying on
 * every webhook redelivery - has sent people six welcome emails before now. A
 * missed welcome is a support question; six is a complaint.
 */
export const sendWelcomeEmail = async (
  engine: EngineWrite,
  membership: MembershipDoc,
  settings: MemberSettings,
): Promise<MemberEmailResult> => {
  if (!settings.featureEnabled) return { sent: false, reason: 'feature-off' }
  if (membership.welcomeEmailSentAt) return { sent: false, reason: 'already-sent' }

  const to = emailOf(membership)
  if (!to) return { sent: false, reason: 'no-address' }

  const values = {
    tier: nameOf(membership.tier),
    renewsAt: membership.renewsAt ? new Date(membership.renewsAt).toDateString() : '',
    days: '',
  }

  const subject = fill(settings.emails.welcomeSubject, values)
  const body = fill(settings.emails.welcomeBody || 'Your membership is now active.', values)

  await engine
    .update({
      collection: MEMBERSHIPS_SLUG,
      id: membership.id,
      data: { welcomeEmailSentAt: new Date().toISOString() },
      overrideAccess: true,
    })
    .catch((): undefined => undefined)

  const sendEmail = await loadSendEmail()
  const result = await sendEmail({ to, subject, text: body, html: asHtml(body) })

  return result.ok ? { sent: true } : { sent: false, reason: result.error ?? result.reason }
}

export type ReminderSweep = { considered: number; sent: number; skipped: number }

/**
 * Sends the expiry reminder to everyone whose membership ends within the
 * configured window.
 *
 * A sweep rather than a per-membership timer: there is no scheduler in this
 * project that can hold a job per member, and re-deciding from the data on each
 * run means a membership whose renewal date moved is reminded on the new date
 * rather than the old one. Call it from a cron trigger, once a day.
 *
 * 0 days means "no reminder at all", per the setting.
 */
export const sendExpiryReminders = async (
  engine: EngineWrite,
  settings: MemberSettings,
  now = new Date(),
): Promise<ReminderSweep> => {
  const days = settings.emails.expiryReminderDays
  if (!settings.featureEnabled || days <= 0) return { considered: 0, sent: 0, skipped: 0 }

  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const { docs } = await engine
    .find({
      collection: MEMBERSHIPS_SLUG,
      where: {
        and: [
          { status: { in: ['active', 'trialing'] } },
          { renewsAt: { greater_than: now.toISOString() } },
          { renewsAt: { less_than_equal: horizon.toISOString() } },
        ],
      },
      depth: 1,
      limit: 500,
      overrideAccess: true,
    })
    .catch((): { docs: unknown[] } => ({ docs: [] }))

  const sweep: ReminderSweep = { considered: docs.length, sent: 0, skipped: 0 }
  const sendEmail = await loadSendEmail()

  for (const membership of docs as MembershipDoc[]) {
    // Already reminded for THIS period. Comparing against the renewal date
    // rather than just "has a timestamp" means a member who renews and later
    // approaches a new expiry is reminded again.
    if (membership.expiryReminderSentAt && membership.renewsAt) {
      const sentAt = new Date(membership.expiryReminderSentAt).getTime()
      const windowOpened = new Date(membership.renewsAt).getTime() - days * 24 * 60 * 60 * 1000
      if (Number.isFinite(sentAt) && sentAt >= windowOpened) {
        sweep.skipped += 1
        continue
      }
    }

    const to = emailOf(membership)
    if (!to) {
      sweep.skipped += 1
      continue
    }

    const renewsAt = membership.renewsAt ? new Date(membership.renewsAt) : null
    const remaining = renewsAt
      ? Math.max(0, Math.ceil((renewsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : days

    const values = {
      tier: nameOf(membership.tier),
      renewsAt: renewsAt ? renewsAt.toDateString() : '',
      days: String(remaining),
    }

    const body = fill(
      `Your {{tier}} membership is due to renew on {{renewsAt}} - that is {{days}} day(s) away.`,
      values,
    )

    await engine
      .update({
        collection: MEMBERSHIPS_SLUG,
        id: membership.id,
        data: { expiryReminderSentAt: now.toISOString() },
        overrideAccess: true,
      })
      .catch((): undefined => undefined)

    const result = await sendEmail({
      to,
      subject: fill('Your {{tier}} membership renews in {{days}} day(s)', values),
      text: body,
      html: asHtml(body),
    })

    if (result.ok) sweep.sent += 1
    else sweep.skipped += 1
  }

  return sweep
}
