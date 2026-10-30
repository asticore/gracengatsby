'use server'

import { createWebhookRecord, deleteWebhookRecord, setWebhookEnabledRecord, updateWebhookRecord } from './admin'
import { MAX_WEBHOOKS, newSigningSecret, MAX_RATE_PER_MINUTE, DEFAULT_RATE_PER_MINUTE, MAX_ATTEMPTS, MAX_PAYLOAD_BYTES, MERGE_TAGS } from './core'
import { EVENT_FIELDS, EVENT_LABEL_KEYS, WEBHOOK_EVENTS, type WebhookEvent } from './events'
import { gate, auditWebhook } from './gate'
import { replayDelivery, sendTest, type AttemptOutcome } from './delivery'
import { sealSecret } from './secret'
import type { DeliveryRecord, WebhookRecord, WebhookStore } from './store'

/**
 * What the webhooks builder screen calls. Every action first runs the gate (signed in, the
 * `webhooks` permission for the action, not impersonating). Writes are audited with the webhook id,
 * never its secret or its body. The signing secret is returned exactly twice: when a webhook is
 * created and when its secret is rotated. Nothing else returns it.
 */

export type WebhookView = {
  id: number
  name: string
  description: string
  url: string
  host: string
  events: WebhookEvent[]
  template: string | null
  enabled: boolean
  ratePerMinute: number
  createdAt: string
  updatedAt: string
  last: { status: string; at: string; statusCode: number | null; error: string | null } | null
}

export type DeliveryView = {
  id: number
  deliveryId: string
  event: string
  status: string
  attempts: number
  nextAttemptAt: string | null
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
}

export type WebhooksData = {
  webhooks: WebhookView[]
  events: Array<{ event: WebhookEvent; labelKey: string; fields: readonly string[] }>
  limits: { maxWebhooks: number; defaultRate: number; maxRate: number; maxAttempts: number; maxPayloadBytes: number; mergeTags: readonly string[] }
  secretsReady: boolean
  canEdit: boolean
}

export type WebhookResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string }

const SECRET_SETUP = 'Set ENGAGE_SECRET for this site before creating a webhook. Signing secrets are encrypted with it.'

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const toView = (w: WebhookRecord, last: DeliveryRecord | null): WebhookView => ({
  id: w.id,
  name: w.name,
  description: w.description,
  url: w.url,
  host: hostOf(w.url),
  events: w.events,
  template: w.template,
  enabled: w.enabled,
  ratePerMinute: w.ratePerMinute,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
  last: last ? { status: last.status, at: last.updatedAt, statusCode: last.lastStatusCode, error: last.lastError } : null,
})

const toDeliveryView = (d: DeliveryRecord): DeliveryView => ({
  id: d.id,
  deliveryId: d.deliveryId,
  event: d.event,
  status: d.status,
  attempts: d.attempts,
  nextAttemptAt: d.nextAttemptAt,
  lastStatusCode: d.lastStatusCode,
  lastError: d.lastError,
  createdAt: d.createdAt,
})

const deps = (store: WebhookStore) => ({ store })

const outcomeView = (o: AttemptOutcome & { deliveryId?: string | null }) => ({ status: o.status, statusCode: o.statusCode, error: o.error, deliveryId: o.deliveryId ?? null })

/** Everything the screen needs to draw the list and the editor. */
export async function loadWebhooksAction(): Promise<WebhookResult<WebhooksData>> {
  const g = await gate('read')
  if (g.ok === false) return g
  const hooks = await g.store.list()
  const webhooks: WebhookView[] = []
  for (const hook of hooks) webhooks.push(toView(hook, await g.store.lastDelivery(hook.id)))
  return {
    ok: true,
    value: {
      webhooks,
      events: WEBHOOK_EVENTS.map((event) => ({ event, labelKey: EVENT_LABEL_KEYS[event], fields: EVENT_FIELDS[event] })),
      limits: {
        maxWebhooks: MAX_WEBHOOKS,
        defaultRate: DEFAULT_RATE_PER_MINUTE,
        maxRate: MAX_RATE_PER_MINUTE,
        maxAttempts: MAX_ATTEMPTS,
        maxPayloadBytes: MAX_PAYLOAD_BYTES,
        mergeTags: MERGE_TAGS,
      },
      secretsReady: Boolean(process.env.ENGAGE_SECRET),
      canEdit: true,
    },
  }
}

/**
 * Creates a webhook (returns its signing secret once) or updates one (no secret). `id` absent
 * means create. The URL is checked here too, so the editor shows the reason straight away.
 */
export async function saveWebhookAction(id: number | null, input: unknown): Promise<WebhookResult<{ webhook: WebhookView; secret: string | null }>> {
  const g = await gate(id === null ? 'create' : 'update')
  if (g.ok === false) return g
  const at = new Date().toISOString()
  if (id === null) {
    if (!process.env.ENGAGE_SECRET) return { ok: false, error: SECRET_SETUP }
    const secret = newSigningSecret()
    const created = await createWebhookRecord(g.store, input, sealSecret(secret), at)
    if (created.ok === false) return { ok: false, error: created.error }
    await auditWebhook(g, 'create', created.value.id, `${created.value.name}: ${hostOf(created.value.url)}`)
    return { ok: true, value: { webhook: toView(created.value, null), secret } }
  }
  const updated = await updateWebhookRecord(g.store, id, input, at)
  if (updated.ok === false) return { ok: false, error: updated.error }
  await auditWebhook(g, 'update', updated.value.id, `${updated.value.name}: ${hostOf(updated.value.url)}`)
  return { ok: true, value: { webhook: toView(updated.value, await g.store.lastDelivery(id)), secret: null } }
}

/** A new signing secret. The old one stops verifying at once. Shown once. */
export async function rotateSecretAction(id: number): Promise<WebhookResult<{ secret: string }>> {
  const g = await gate('update')
  if (g.ok === false) return g
  if (!process.env.ENGAGE_SECRET) return { ok: false, error: SECRET_SETUP }
  if (!(await g.store.findById(id))) return { ok: false, error: 'That webhook no longer exists.' }
  const secret = newSigningSecret()
  await g.store.setSecret(id, sealSecret(secret), new Date().toISOString())
  await auditWebhook(g, 'update', id, 'signing secret rotated')
  return { ok: true, value: { secret } }
}

export async function setWebhookEnabledAction(id: number, enabled: boolean): Promise<WebhookResult<WebhookView>> {
  const g = await gate('update')
  if (g.ok === false) return g
  const result = await setWebhookEnabledRecord(g.store, id, enabled, new Date().toISOString())
  if (result.ok === false) return { ok: false, error: result.error }
  await auditWebhook(g, 'update', id, enabled ? 'turned on' : 'turned off')
  return { ok: true, value: toView(result.value, await g.store.lastDelivery(id)) }
}

export async function deleteWebhookAction(id: number): Promise<WebhookResult> {
  const g = await gate('delete')
  if (g.ok === false) return g
  const existing = await g.store.findById(id)
  const result = await deleteWebhookRecord(g.store, id)
  if (result.ok === false) return { ok: false, error: result.error }
  if (existing) await auditWebhook(g, 'delete', id, `${existing.name}: ${hostOf(existing.url)}`)
  return { ok: true }
}

/** The Test button: sends one sample delivery now and reports the answer. */
export async function testWebhookAction(id: number): Promise<WebhookResult<ReturnType<typeof outcomeView>>> {
  const g = await gate('update')
  if (g.ok === false) return g
  const outcome = await sendTest(deps(g.store), id)
  if (outcome.error === 'That webhook no longer exists.') return { ok: false, error: outcome.error }
  await auditWebhook(g, 'update', id, `test sent: ${outcome.status}`)
  return { ok: true, value: outcomeView(outcome) }
}

/** The delivery log for one webhook, newest first. Bodies are not sent to the browser. */
export async function listDeliveriesAction(webhookId: number): Promise<WebhookResult<DeliveryView[]>> {
  const g = await gate('read')
  if (g.ok === false) return g
  return { ok: true, value: (await g.store.listDeliveries(webhookId, 50)).map(toDeliveryView) }
}

/** Sends a logged delivery again, with its original body and delivery id. */
export async function replayDeliveryAction(deliveryId: number): Promise<WebhookResult<ReturnType<typeof outcomeView>>> {
  const g = await gate('update')
  if (g.ok === false) return g
  const row = await g.store.findDelivery(deliveryId)
  const outcome = await replayDelivery(deps(g.store), deliveryId)
  if (row) await auditWebhook(g, 'update', row.webhookId, `replayed: ${outcome.status}`)
  return { ok: true, value: outcomeView(outcome) }
}
