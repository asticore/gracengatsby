import { sendEmail } from '@/features/email'
import { dueReminder, signCartToken, type AbandonedSettings } from '../lib/abandonedCart'
import { escapeHtml } from '../lib/invoice'
import { rawD1, runChanges, SQL } from './db'

type Engine = { findGlobal: (a: unknown) => Promise<Record<string, unknown>> }
type Row = { id: number; email: string; updated_at: string; reminders_sent: number | null; last_reminder_at: string | null; item_count: number }

export function readAbandonedSettings(settings: Record<string, unknown>): AbandonedSettings & { subject: string; bodyTemplate: string } {
  const a = (settings.abandonedCart ?? {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    enabled: a.enabled === true,
    firstDelayHours: num(a.firstDelayHours, 1),
    secondDelayHours: num(a.secondDelayHours, 24),
    maxReminders: num(a.maxReminders, 2),
    subject: typeof a.subject === 'string' && a.subject ? a.subject : 'You left something in your cart',
    bodyTemplate: typeof a.bodyTemplate === 'string' ? a.bodyTemplate : '',
  }
}

/** Sends due reminders. Called from the 5-minute cron. Does nothing while the setting is off. */
export async function runAbandonedCartReminders(engine: Engine, now = new Date()): Promise<{ sent: number }> {
  const settings = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): Record<string, unknown> => ({}))
  const cfg = readAbandonedSettings(settings)
  if (!cfg.enabled) return { sent: 0 }
  const secret = process.env.ENGAGE_SECRET
  if (!secret) return { sent: 0 }
  const site = (await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): Record<string, unknown> => ({}))) as { siteName?: string }
  const baseUrl = (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/+$/, '')
  const d1 = await rawD1()
  const since = new Date(now.getTime() - 14 * 24 * 3_600_000).toISOString()
  const rows = (
    await d1
      .prepare(
        `SELECT c.id, c.email, c.updated_at, c.reminders_sent, c.last_reminder_at,
           (SELECT COUNT(*) FROM eg_carts_items i WHERE i._parent_id = c.id) AS item_count
         FROM eg_carts c
         WHERE c.email IS NOT NULL AND c.email != '' AND c.purchased_at IS NULL AND c.recovered_at IS NULL
           AND COALESCE(c.unsubscribed,0) = 0 AND COALESCE(c.reminders_sent,0) < 2 AND c.updated_at > ?1
         LIMIT 100`,
      )
      .bind(since)
      .all<Row>()
  ).results
  let sent = 0
  const sevenDays = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString()
  for (const row of rows) {
    // Anyone can type any address at guest checkout, so only email people we already know: a registered
    // customer, or an address with a paid order. An unsubscribed address, or one already reminded about
    // another cart in the last 7 days, is skipped.
    const known = await d1
      .prepare(
        `SELECT
           (EXISTS (SELECT 1 FROM eg_users u WHERE lower(u.email) = lower(?1))
            OR EXISTS (SELECT 1 FROM eg_orders o WHERE lower(o.customer_email) = lower(?1) AND o.status IN ('processing','on-hold','completed','refunded'))) AS known,
           EXISTS (SELECT 1 FROM eg_carts x WHERE lower(x.email) = lower(?1) AND COALESCE(x.unsubscribed,0) = 1) AS suppressed,
           EXISTS (SELECT 1 FROM eg_carts x WHERE lower(x.email) = lower(?1) AND x.id != ?2 AND x.last_reminder_at IS NOT NULL AND x.last_reminder_at > ?3) AS recent`,
      )
      .bind(row.email, row.id, sevenDays)
      .first<{ known: number; suppressed: number; recent: number }>()
    if (!known?.known || known.suppressed || known.recent) continue
    const due = dueReminder(
      { email: row.email, updatedAt: row.updated_at, remindersSent: row.reminders_sent, lastReminderAt: row.last_reminder_at, itemCount: row.item_count },
      cfg,
      now,
    )
    if (!due) continue
    // Claim the reminder first so an overlapping cron run cannot send it twice.
    const claimed = await runChanges(d1, `UPDATE eg_carts SET reminders_sent = ?2, last_reminder_at = ?3 WHERE id = ?1 AND COALESCE(reminders_sent,0) = ?4`, row.id, due, now.toISOString(), due - 1)
    if (!claimed) continue
    const recover = `${baseUrl}/api/shop-cart-recover?t=${encodeURIComponent(await signCartToken(secret, row.id, 'recover'))}`
    const unsub = `${baseUrl}/api/shop-cart-unsubscribe?t=${encodeURIComponent(await signCartToken(secret, row.id, 'unsub'))}`
    const name = site.siteName || 'our shop'
    const intro = (cfg.bodyTemplate || 'You left some items in your cart at {{site_name}}. They are still waiting for you.').replace(/\{\{\s*site_name\s*\}\}/g, name)
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5"><p>${escapeHtml(intro).replace(/\n/g, '<br>')}</p><p><a href="${escapeHtml(recover)}">Return to your cart</a></p><p style="font-size:12px;color:#666"><a href="${escapeHtml(unsub)}">Unsubscribe from cart reminders</a></p></div>`
    const text = `${intro}\n\nReturn to your cart: ${recover}\n\nUnsubscribe: ${unsub}`
    const result = await sendEmail({ to: row.email, template: 'cart.abandoned', subject: cfg.subject.replace(/[\r\n]+/g, ' '), html, text })
    if (result.ok) sent += 1
    else await runChanges(d1, SQL.cartReminded, row.id, due - 1, row.last_reminder_at) // release so a later run retries
  }
  return { sent }
}
