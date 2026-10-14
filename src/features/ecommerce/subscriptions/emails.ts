import { sendEmail } from '@/features/email'
import { escapeHtml } from '../lib/invoice'
import { formatCents } from '../lib/money'
import { intervalPhrase } from './plan'
import type { SubscriptionRecord } from './records'

/**
 * The four subscription emails. They go through the email system like every other message, under
 * the template keys below, so the "When emails are sent" switches (src/features/email/schedule.ts)
 * hold them when they are off. Never throws: a failed email must not fail a payment.
 */

export type SubscriptionEmailKind = 'new' | 'renewal' | 'failed' | 'cancelled'

type Copy = { subject: string; lines: string[] }

function copyFor(kind: SubscriptionEmailKind, rec: SubscriptionRecord, extra: { amountCents?: number; orderId?: number }): Copy {
  const product = rec.productName || 'your subscription'
  const currency = rec.currency || 'AUD'
  const price = formatCents(rec.amountCents ?? 0, currency)
  const every = intervalPhrase((rec.billingInterval as never) ?? 'month', rec.billingIntervalCount ?? 1)
  const next = rec.nextPaymentAt ? new Date(rec.nextPaymentAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const manage = 'You can pause, cancel or check your subscriptions in My subscriptions on your account page.'
  switch (kind) {
    case 'new':
      return {
        subject: `Your subscription to ${product} has started`,
        lines: [
          `Thanks for subscribing to ${product}.`,
          `You will be charged ${price} ${every}.${rec.trialEndsAt ? ` Your free trial ends on ${new Date(rec.trialEndsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}`,
          manage,
        ],
      }
    case 'renewal':
      return {
        subject: `Payment received for ${product}`,
        lines: [
          `We received your payment of ${formatCents(extra.amountCents ?? rec.amountCents ?? 0, currency)} for ${product}.`,
          extra.orderId ? `This is order number ${extra.orderId}.` : '',
          next ? `Your next payment is due on ${next}.` : '',
          manage,
        ].filter(Boolean),
      }
    case 'failed':
      return {
        subject: `We could not take your payment for ${product}`,
        lines: [
          `Your bank or card did not accept the payment for ${product}.`,
          'We will try again automatically. Check that your card details are up to date, and that there is enough money to cover the payment.',
          manage,
        ],
      }
    case 'cancelled':
      return {
        subject: `Your subscription to ${product} has ended`,
        lines: [`Your subscription to ${product} has ended and you will not be charged again.`, 'Thanks for being a customer. You can always buy again from the shop.'],
      }
  }
}

export async function sendSubscriptionEmail(kind: SubscriptionEmailKind, rec: SubscriptionRecord, extra: { amountCents?: number; orderId?: number } = {}): Promise<boolean> {
  try {
    const to = typeof rec.customerEmail === 'string' ? rec.customerEmail.trim() : ''
    if (!to) return false
    const copy = copyFor(kind, rec, extra)
    const result = await sendEmail({
      to,
      template: `subscription.${kind}`,
      subject: copy.subject,
      text: copy.lines.join('\n\n'),
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${copy.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>`,
    })
    return result.ok
  } catch {
    return false
  }
}
