import { sendEmail } from '@/features/email'
import { escapeHtml } from '../lib/invoice'
import { formatCents } from '../lib/money'
import { ORDER_STATUS_LABELS, isOrderStatus } from '../lib/orderStatus'
import { preorderSummary } from '../lib/preorder'

type Engine = { findGlobal: (a: unknown) => Promise<Record<string, unknown>> }
export type EmailKind = 'processing' | 'completed' | 'onHold' | 'cancelled' | 'refunded' | 'failed' | 'customerNote' | 'shipped'

const STATUS_TO_KIND: Record<string, EmailKind | undefined> = {
  processing: 'processing',
  completed: 'completed',
  'on-hold': 'onHold',
  cancelled: 'cancelled',
  refunded: 'refunded',
  failed: 'failed',
}
export const kindForStatus = (status: string): EmailKind | null => STATUS_TO_KIND[status] ?? null

const DEFAULTS: Record<EmailKind, { subject: string; body: string }> = {
  processing: { subject: 'Thanks - we received order #{{order_id}}', body: 'Hi {{customer_name}},\n\nThanks for your order. We are getting it ready. Order total: {{order_total}}.' },
  completed: { subject: 'Your order #{{order_id}} is complete', body: 'Hi {{customer_name}},\n\nYour order #{{order_id}} is complete.' },
  onHold: { subject: 'Your order #{{order_id}} is on hold', body: 'Hi {{customer_name}},\n\nYour order #{{order_id}} is on hold. We will be in touch.' },
  cancelled: { subject: 'Your order #{{order_id}} was cancelled', body: 'Hi {{customer_name}},\n\nYour order #{{order_id}} has been cancelled.' },
  refunded: { subject: 'Your order #{{order_id}} was refunded', body: 'Hi {{customer_name}},\n\nA refund has been issued for order #{{order_id}}. {{note}}' },
  failed: { subject: 'Payment failed for order #{{order_id}}', body: 'Hi {{customer_name}},\n\nThe payment for order #{{order_id}} did not go through.' },
  customerNote: { subject: 'A note about your order #{{order_id}}', body: 'Hi {{customer_name}},\n\nThere is a note on your order #{{order_id}}:\n\n{{note}}' },
  shipped: { subject: 'Your order #{{order_id}} is on its way', body: 'Hi {{customer_name}},\n\nYour order #{{order_id}} has shipped with {{carrier}}.\nTracking number: {{tracking_number}}\nTrack it here: {{tracking_url}}' },
}

/** Every kind a shop owner can edit the wording of (Shop settings > Emails). */
export const EMAIL_KINDS: EmailKind[] = ['processing', 'completed', 'onHold', 'cancelled', 'refunded', 'failed', 'shipped', 'customerNote']
export const DEFAULT_EMAIL_TEMPLATES = DEFAULTS

/** Replaces {{field}} with already-escaped values; unknown fields become empty. */
export function mergeFields(template: string, values: Record<string, string>, escape: boolean): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => {
    const v = values[key] ?? ''
    return escape ? escapeHtml(v) : v
  })
}

export type EmailTemplateOverride = { subject?: string; body?: string }

/** Reads `<kind>Subject` / `<kind>Body` from the `templates` group of the shop settings. Blank means "use the built-in text". */
export function templateFor(templates: unknown, kind: EmailKind): EmailTemplateOverride {
  const t = (templates && typeof templates === 'object' ? templates : {}) as Record<string, unknown>
  const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  return { subject: clean(t[`${kind}Subject`], 300), body: clean(t[`${kind}Body`], 5000) }
}

export function renderOrderEmail(kind: EmailKind, order: Record<string, unknown>, opts: { note?: string; siteName?: string; bodyOverride?: string; template?: EmailTemplateOverride }) {
  const addr = (order.shippingAddress ?? {}) as Record<string, unknown>
  const name = [addr.firstName, addr.lastName].filter((x) => typeof x === 'string' && x).join(' ') || 'there'
  const status = String(order.status ?? '')
  const values: Record<string, string> = {
    order_id: String(order.id ?? ''),
    customer_name: name,
    order_total: formatCents(order.amount as number, (order.currency as string) || 'AUD'),
    status: isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : status,
    note: opts.note ?? '',
    site_name: opts.siteName ?? '',
    order_number: String(order.orderNumber || order.id || ''),
    carrier: String(order.trackingCarrier ?? ''),
    tracking_number: String(order.trackingNumber ?? ''),
    tracking_url: String(order.trackingUrl ?? ''),
  }
  const tpl = DEFAULTS[kind]
  const subject = mergeFields(opts.template?.subject ?? tpl.subject, values, false).replace(/[\r\n]+/g, ' ')
  // A per-status template wins over the shared body, which wins over the built-in text.
  const bodyTpl = opts.template?.body ?? (opts.bodyOverride && kind !== 'customerNote' ? opts.bodyOverride : tpl.body)
  // Pre-order lines get one extra paragraph, whatever the wording of the template.
  const preorderNote = preorderSummary(order.lineItems)
  const text = mergeFields(bodyTpl, values, false) + (preorderNote ? `\n\n${preorderNote}` : '')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${mergeFields(bodyTpl, values, true).replace(/\n/g, '<br>')}${preorderNote ? `<p>${escapeHtml(preorderNote)}</p>` : ''}</div>`
  return { subject, text, html }
}

/** Sends one order email if its toggle is on. Never throws. */
export async function sendOrderEmail(engine: Engine, order: Record<string, unknown>, kind: EmailKind, note?: string): Promise<boolean> {
  try {
    const to = typeof order.customerEmail === 'string' ? order.customerEmail : ''
    if (!to) return false
    const settings = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as { emails?: Record<string, unknown>; templates?: unknown }
    const emails = settings.emails ?? {}
    const defaultOn = kind !== 'failed'
    if ((emails[kind] ?? defaultOn) === false || emails[kind] === 0) return false
    const site = (await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch(() => ({}))) as { siteName?: string }
    const msg = renderOrderEmail(kind, order, { note, siteName: site.siteName, template: templateFor(settings.templates, kind), bodyOverride: typeof emails.bodyTemplate === 'string' && emails.bodyTemplate.trim() ? emails.bodyTemplate : undefined })
    const result = await sendEmail({ to, template: `order.${kind}`, ...msg })
    return result.ok
  } catch {
    return false
  }
}

export async function sendAdminNewOrderEmail(engine: Engine, order: Record<string, unknown>): Promise<void> {
  try {
    const settings = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as { emails?: Record<string, unknown> }
    const emails = settings.emails ?? {}
    const to = typeof emails.adminEmail === 'string' ? emails.adminEmail : ''
    if (!to || !emails.newOrderAdmin) return
    await sendEmail({ to, template: 'order.admin-new', subject: `New order #${order.id}`, text: `New order #${order.id}, total ${formatCents(order.amount as number)}.` })
  } catch {
    /* notification only */
  }
}

/** Tells the shop admin an order needs a person's attention (late payment, oversold, mismatch). Never throws. */
export async function sendAdminAttentionEmail(engine: Engine, orderId: number, text: string): Promise<void> {
  try {
    const settings = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as { emails?: Record<string, unknown> }
    const to = typeof settings.emails?.adminEmail === 'string' ? settings.emails.adminEmail : ''
    if (!to) return
    await sendEmail({ to, template: 'order.admin-attention', subject: `Order #${orderId} needs attention`, text: `Order #${orderId} needs attention: ${text}` })
  } catch {
    /* notification only */
  }
}
