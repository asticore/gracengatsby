/**
 * PayPal webhooks (server only). PayPal posts an event whenever a payment changes. Nothing in an event is believed
 * until PayPal confirms its signature (verify-webhook-signature, using the webhook id saved in Payments).
 *  - PAYMENT.CAPTURE.COMPLETED settles the order through settleOrderCapture, the same rules as the buyer's capture.
 *    A repeat event changes nothing.
 *  - PAYMENT.CAPTURE.DENIED / DECLINED fails an unpaid order, or flags a paid one for staff.
 *  - PAYMENT.CAPTURE.REFUNDED is recorded as a note only: stock and store credit are never changed here.
 * Unknown events get a 200 straight away. Nothing secret is logged or returned.
 */

import type { Engine } from '@/localapi/engine'

import { addOrderNote, flagAttention, markOrderFailed } from '../server/orders'
import { formatPayPalAmount, getAccessToken, parsePayPalAmount, paypalBaseUrl, PayPalError, type PayPalCapture, type PayPalOptions, type PayPalSettings } from './paypalAdapter'
import { settleOrderCapture, type PayPalOrderRow } from './paypalCheckout'

type Doc = Record<string, unknown>
type Db = { find: (a: unknown) => Promise<{ docs: Doc[] }> }
type OrderDoc = PayPalOrderRow & { id: number; notes?: unknown }

/** The saved PayPal group (may be partly empty: a missing value means PayPal is not set up yet). */
export type WebhookSettings = Partial<PayPalSettings> & { webhookId?: string | null }
export type WebhookRequest = { headers: Headers; rawBody: string }
export type WebhookResult = { status: number; body: Record<string, unknown> }

const MAX_BODY_BYTES = 262_144
const PAYPAL_ID = /^[A-Za-z0-9]{4,40}$/
const KNOWN_EVENTS = new Set(['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.REFUNDED'])

const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null)
/** A PayPal order or capture id, or null when the value is not one. */
const idOf = (value: unknown): string | null => {
  const text = str(value)
  return text && PAYPAL_ID.test(text) ? text : null
}

/** PayPal's signing certificate must be served from paypal.com over https. Anything else is refused before any call. */
export function isPayPalCertUrl(value: string | null): boolean {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && (url.hostname === 'paypal.com' || url.hostname.endsWith('.paypal.com'))
  } catch {
    return false
  }
}

/** Asks PayPal whether the event really came from it. Any answer other than SUCCESS, or a missing header, is a refusal. */
export async function verifyPayPalWebhook(settings: PayPalSettings & { webhookId: string }, request: WebhookRequest, event: Doc, options: PayPalOptions = {}): Promise<boolean> {
  const header = (name: string): string | null => request.headers.get(name)?.trim() || null
  const certUrl = header('paypal-cert-url')
  const authAlgo = header('paypal-auth-algo')
  const transmissionId = header('paypal-transmission-id')
  const transmissionTime = header('paypal-transmission-time')
  const transmissionSig = header('paypal-transmission-sig')
  if (!isPayPalCertUrl(certUrl) || !authAlgo || !transmissionId || !transmissionTime || !transmissionSig) return false

  const fetchImpl = options.fetch ?? fetch
  const token = await getAccessToken(settings, options)
  const res = await fetchImpl(`${paypalBaseUrl(settings.environment)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: settings.webhookId,
      webhook_event: event,
    }),
  })
  if (!res.ok) throw new PayPalError(`PayPal could not check the webhook signature (${res.status}).`)
  const json = (await res.json().catch((): Doc => ({}))) as Doc
  return json.verification_status === 'SUCCESS'
}

/** Finds the shop order for an event: by the PayPal order id when the event has one, else by the capture id. */
async function findOrder(db: Db, ids: { paypalOrderId: string | null; captureId: string | null }): Promise<OrderDoc | null> {
  const attempts: Doc[] = []
  if (ids.paypalOrderId) attempts.push({ paypalOrderId: { equals: ids.paypalOrderId } })
  if (ids.captureId) attempts.push({ paypalCaptureId: { equals: ids.captureId } })
  for (const where of attempts) {
    const found = await db.find({ collection: 'orders', where, limit: 1, depth: 0, overrideAccess: true })
    if (found.docs[0]) return found.docs[0] as OrderDoc
  }
  return null
}

const relatedOrderId = (resource: Doc): string | null => {
  const ids = ((resource.supplementary_data as Doc | undefined)?.related_ids ?? {}) as Doc
  return idOf(ids.order_id)
}

/** A refund names its capture in an "up" link; the capture id is the last part of that address. */
const captureIdFromLinks = (resource: Doc): string | null => {
  const links = Array.isArray(resource.links) ? (resource.links as Doc[]) : []
  const href = str(links.find((link) => link.rel === 'up')?.href)
  const last = href ? href.split('/').pop() ?? '' : ''
  return PAYPAL_ID.test(last) ? last : null
}

const hasNote = (order: OrderDoc, marker: string): boolean =>
  Array.isArray(order.notes) && (order.notes as Array<{ text?: unknown }>).some((note) => typeof note?.text === 'string' && note.text.includes(marker))

async function onCaptureCompleted(engine: Engine, db: Db, resource: Doc): Promise<void> {
  const order = await findOrder(db, { paypalOrderId: relatedOrderId(resource), captureId: idOf(resource.id) })
  if (!order) return
  const amount = (resource.amount ?? {}) as Doc
  const capture: PayPalCapture = {
    status: 'COMPLETED',
    captureId: str(resource.id),
    captureStatus: str(resource.status),
    amountCents: parsePayPalAmount(amount.value),
    currency: str(amount.currency_code),
  }
  await settleOrderCapture(engine, order, async () => capture)
}

async function onCaptureDeclined(engine: Engine, db: Db, resource: Doc, eventType: string): Promise<void> {
  const captureId = idOf(resource.id)
  const order = await findOrder(db, { paypalOrderId: relatedOrderId(resource), captureId })
  if (!order) return
  const outcome = eventType.endsWith('DENIED') ? 'DENIED' : 'DECLINED'
  const marker = `PayPal reports capture ${captureId ?? 'unknown'} as ${outcome}`
  if (hasNote(order, marker)) return
  if (order.paidAt) {
    await flagAttention(engine as never, order.id, `${marker}, but this order is already paid. Check it in PayPal.`)
    return
  }
  await markOrderFailed(engine as never, order.id)
  await addOrderNote(engine as never, order.id, { type: 'internal', text: `${marker}. The order was marked failed.`, author: 'PayPal' })
}

async function onRefund(engine: Engine, db: Db, resource: Doc): Promise<void> {
  const refundId = str(resource.id)
  const order = await findOrder(db, { paypalOrderId: relatedOrderId(resource), captureId: captureIdFromLinks(resource) })
  if (!order) return
  const marker = `PayPal reports a refund (${refundId ?? 'unknown'})`
  if (hasNote(order, marker)) return
  const amount = (resource.amount ?? {}) as Doc
  const cents = parsePayPalAmount(amount.value)
  const money = cents === null ? 'an unknown amount' : `${formatPayPalAmount(cents)} ${str(amount.currency_code) ?? ''}`.trim()
  await addOrderNote(engine as never, order.id, {
    type: 'internal',
    text: `${marker} of ${money}. This is recorded only: stock and store credit were not changed. Check the refund in PayPal.`,
    author: 'PayPal',
  })
}

/**
 * Handles one webhook delivery. Returns the HTTP status and body for PayPal. A 4xx means "this delivery is bad";
 * a 503 or a thrown error means "try again later" (PayPal retries).
 */
export async function handlePayPalWebhook(engine: Engine, settings: WebhookSettings, request: WebhookRequest, options: PayPalOptions = {}): Promise<WebhookResult> {
  if (request.rawBody.length > MAX_BODY_BYTES) return { status: 413, body: { error: 'Event too large.' } }
  let event: Doc
  try {
    event = JSON.parse(request.rawBody) as Doc
  } catch {
    return { status: 400, body: { error: 'Not a JSON event.' } }
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.event_type !== 'string') return { status: 400, body: { error: 'Not a PayPal event.' } }
  // Events this shop does not use are acknowledged without any call to PayPal.
  if (!KNOWN_EVENTS.has(event.event_type)) return { status: 200, body: { received: true } }

  if (!settings.clientId || !settings.clientSecret || !settings.webhookId) {
    return { status: 503, body: { error: 'PayPal webhooks are not set up yet.' } }
  }
  let verified: boolean
  try {
    const paypal = { clientId: settings.clientId, clientSecret: settings.clientSecret, environment: settings.environment, webhookId: settings.webhookId }
    verified = await verifyPayPalWebhook(paypal, request, event, options)
  } catch (error) {
    if (error instanceof PayPalError) return { status: 503, body: { error: 'PayPal could not be reached to check this event.' } }
    throw error
  }
  if (!verified) return { status: 400, body: { error: 'The signature check failed.' } }

  const db = engine as unknown as Db
  const resource = (event.resource && typeof event.resource === 'object' ? event.resource : {}) as Doc
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') await onCaptureCompleted(engine, db, resource)
  else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') await onRefund(engine, db, resource)
  else await onCaptureDeclined(engine, db, resource, event.event_type)
  return { status: 200, body: { received: true } }
}
