/**
 * The events a webhook can subscribe to, and the fields each one may send. Pure data: no database,
 * no engine. Every event sends an allowlist of fields only, never a whole document, so a new column
 * on a collection can never leak into a webhook by accident.
 */

export const WEBHOOK_EVENTS = [
  'content.created',
  'content.updated',
  'content.published',
  'content.unpublished',
  'order.created',
  'order.paid',
  'order.refunded',
  'form.submitted',
  'user.registered',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** Sent only by the Test button. Never offered as a subscription. */
export const TEST_EVENT = 'webhook.test' as const

export const isWebhookEvent = (value: unknown): value is WebhookEvent => typeof value === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(value)

/** Admin label keys (uiStrings) for each event, in the order the editor lists them. */
export const EVENT_LABEL_KEYS: Record<WebhookEvent, string> = {
  'content.created': 'webhooks.event.content.created',
  'content.updated': 'webhooks.event.content.updated',
  'content.published': 'webhooks.event.content.published',
  'content.unpublished': 'webhooks.event.content.unpublished',
  'order.created': 'webhooks.event.order.created',
  'order.paid': 'webhooks.event.order.paid',
  'order.refunded': 'webhooks.event.order.refunded',
  'form.submitted': 'webhooks.event.form.submitted',
  'user.registered': 'webhooks.event.user.registered',
}

/** The fields each event may send. `values` on form.submitted is the entry's answers, as the form webhook sends them. */
export const EVENT_FIELDS: Record<WebhookEvent, readonly string[]> = {
  'content.created': ['id', 'collection', 'title', 'slug', 'status', 'createdAt', 'updatedAt'],
  'content.updated': ['id', 'collection', 'title', 'slug', 'status', 'createdAt', 'updatedAt'],
  'content.published': ['id', 'collection', 'title', 'slug', 'status', 'createdAt', 'updatedAt'],
  'content.unpublished': ['id', 'collection', 'title', 'slug', 'status', 'createdAt', 'updatedAt'],
  'order.created': ['id', 'status', 'amount', 'customerEmail', 'createdAt'],
  'order.paid': ['id', 'status', 'amount', 'customerEmail', 'createdAt'],
  'order.refunded': ['id', 'orderId', 'amount', 'reason', 'createdAt'],
  'form.submitted': ['id', 'formId', 'formTitle', 'submittedAt', 'values'],
  'user.registered': ['id', 'createdAt'],
}

/** Keeps only the fields an event allows. Missing fields are left out; `undefined` never reaches the body. */
export function pickEventFields(event: WebhookEvent, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of EVENT_FIELDS[event]) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}
