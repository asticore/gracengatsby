import { checkWebhookUrl, DELIVERY_RETENTION_DAYS, FAILURE_ALERT_THRESHOLD, isFailingStreak, isOverRate, nextAttemptAt, REQUEST_TIMEOUT_MS, renderBody, signatureHeader, SIGNATURE_HEADER, type DeliveryStatus } from './core'
import { pickEventFields, TEST_EVENT, type WebhookEvent } from './events'
import { openSecret } from './secret'
import type { DeliveryRecord, WebhookRecord, WebhookStore } from './store'

/**
 * Queues and sends webhook deliveries. Nothing here reads a request or a session. The event hooks
 * queue rows and send them after the response (./emit.ts); the cron job sends the rows that are due
 * again (retries). Each row is leased for the length of one request before it is sent, so two runs
 * never send the same row at once.
 *
 * Headers sent: X-Engage-Event, X-Engage-Delivery (stable across retries and replays, so a receiver
 * can de-duplicate) and X-Engage-Signature (t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">). Redirects
 * are not followed: a 3xx counts as a failed attempt.
 */

export type DeliveryDeps = {
  store: WebhookStore
  fetcher?: typeof fetch
  now?: () => number
  newId?: () => string
  /** Tells the site's admins that a webhook was switched off. Never throws; the emit layer supplies it. */
  notifyAdmins?: (subject: string, text: string) => Promise<void>
}

export type AttemptOutcome = { status: DeliveryStatus; statusCode: number | null; error: string | null }

const clock = (deps: DeliveryDeps): number => (deps.now ? deps.now() : Date.now())

/** A stable id for one delivery, as X-Engage-Delivery. Random, so it does not reveal the row id. */
export function newDeliveryId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `dlv_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Sample values for the Test button, so a template's merge tags show something real. */
export const TEST_DATA: Record<string, unknown> = {
  id: 0,
  collection: 'pages',
  title: 'Sample page',
  slug: 'sample-page',
  status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  message: 'This is a test delivery from the webhooks builder.',
}

/**
 * Writes one pending row for one webhook. A body that cannot be built, or a webhook over its rate
 * limit, is written as skipped with the reason, so the log shows what did not go out.
 */
export async function queueFor(deps: DeliveryDeps, hook: WebhookRecord, event: WebhookEvent | typeof TEST_EVENT, data: Record<string, unknown>, options: { test?: boolean } = {}): Promise<number> {
  const nowMs = clock(deps)
  const at = new Date(nowMs).toISOString()
  const deliveryId = deps.newId ? deps.newId() : newDeliveryId()
  const payload = event === TEST_EVENT ? data : pickEventFields(event, data)
  const rendered = renderBody(hook.template, { event, id: deliveryId, occurredAt: at, data: payload })
  if (rendered.ok === false) {
    return deps.store.insertDelivery({ webhookId: hook.id, deliveryId, event, body: '', status: 'skipped', attempts: 0, nextAttemptAt: null, lastStatusCode: null, lastError: rendered.error }, at)
  }
  if (!options.test) {
    const sent = await deps.store.queuedSince(hook.id, new Date(nowMs - 60_000).toISOString())
    if (isOverRate(sent, hook.ratePerMinute)) {
      return deps.store.insertDelivery(
        { webhookId: hook.id, deliveryId, event, body: rendered.value, status: 'skipped', attempts: 0, nextAttemptAt: null, lastStatusCode: null, lastError: `Rate limit reached: ${hook.ratePerMinute} deliveries a minute.` },
        at,
      )
    }
  }
  return deps.store.insertDelivery({ webhookId: hook.id, deliveryId, event, body: rendered.value, status: 'pending', attempts: 0, nextAttemptAt: at, lastStatusCode: null, lastError: null }, at)
}

/** Queues one delivery for each enabled webhook subscribed to the event. Returns the new row ids. */
export async function queueEvent(deps: DeliveryDeps, event: WebhookEvent, data: Record<string, unknown>): Promise<number[]> {
  const hooks = await deps.store.activeFor(event)
  const ids: number[] = []
  for (const hook of hooks) ids.push(await queueFor(deps, hook, event, data))
  return ids
}

/**
 * After a delivery ends in failure: if the newest finished deliveries all failed, switch the webhook
 * off and tell the admins once. An admin turns it back on from the webhook screen. Never throws.
 */
export async function alertIfFailing(deps: DeliveryDeps, hook: WebhookRecord, at: string): Promise<void> {
  try {
    const outcomes = await deps.store.recentOutcomes(hook.id, FAILURE_ALERT_THRESHOLD)
    if (!isFailingStreak(outcomes, FAILURE_ALERT_THRESHOLD)) return
    if (!hook.enabled) return
    await deps.store.setEnabled(hook.id, false, at)
    await deps.notifyAdmins?.(
      `Webhook "${hook.name}" was switched off`,
      `The webhook "${hook.name}" failed ${FAILURE_ALERT_THRESHOLD} deliveries in a row and has been switched off, so no more events are sent to it. Check the receiving address, then switch it back on from the webhooks screen.`,
    )
  } catch {
    // The alert is best effort.
  }
}

const DONE = (row: DeliveryRecord): AttemptOutcome => ({ status: row.status, statusCode: row.lastStatusCode, error: row.lastError })

/** Sends one pending row now, or records why it cannot be sent. Never throws. */
export async function attemptDelivery(deps: DeliveryDeps, rowId: number): Promise<AttemptOutcome> {
  const { store } = deps
  const fetcher = deps.fetcher ?? fetch
  const nowMs = clock(deps)
  const at = new Date(nowMs).toISOString()
  try {
    const row = await store.findDelivery(rowId)
    if (!row) return { status: 'failed', statusCode: null, error: 'That delivery no longer exists.' }
    if (row.status !== 'pending') return DONE(row)

    const hook = await store.findById(row.webhookId)
    if (!hook || !hook.enabled) {
      await store.updateDelivery(rowId, { status: 'skipped', nextAttemptAt: null, lastError: 'The webhook is off or was deleted.' }, at)
      return { status: 'skipped', statusCode: null, error: 'The webhook is off or was deleted.' }
    }

    const permanent = async (error: string): Promise<AttemptOutcome> => {
      await store.updateDelivery(rowId, { status: 'failed', nextAttemptAt: null, lastError: error }, at)
      await alertIfFailing(deps, hook, at)
      return { status: 'failed', statusCode: null, error }
    }
    // The address is checked again on every try, in case it was changed or the rules tightened.
    const address = checkWebhookUrl(hook.url)
    if (address.ok === false) return permanent(address.error)
    const secret = openSecret(hook.secret)
    if (!secret) return permanent('The signing secret cannot be read. Rotate the secret on this webhook.')

    // Lease the row for one request, so another run does not send it at the same time.
    await store.updateDelivery(rowId, { nextAttemptAt: new Date(nowMs + REQUEST_TIMEOUT_MS * 2).toISOString() }, at)

    const attempts = row.attempts + 1
    const timestamp = Math.floor(nowMs / 1000)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Engage-Webhook/1',
      'X-Engage-Event': row.event,
      'X-Engage-Delivery': row.deliveryId,
      [SIGNATURE_HEADER]: await signatureHeader(secret, timestamp, row.body),
    }

    let statusCode: number | null = null
    let transport: string | null = null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetcher(address.value, { method: 'POST', headers, body: row.body, redirect: 'manual', signal: controller.signal })
      statusCode = response.status
      await response.body?.cancel().catch((): undefined => undefined)
    } catch (error) {
      transport = error instanceof Error && error.name === 'AbortError' ? 'Timed out.' : 'Could not connect.'
    } finally {
      clearTimeout(timer)
    }

    if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
      await store.updateDelivery(rowId, { status: 'ok', attempts, nextAttemptAt: null, lastStatusCode: statusCode, lastError: null }, at)
      return { status: 'ok', statusCode, error: null }
    }

    let error: string
    if (statusCode !== null) error = statusCode >= 300 && statusCode < 400 ? `The receiver redirected (${statusCode}). Redirects are not followed.` : `The receiver answered ${statusCode}.`
    else error = transport ?? 'Could not connect.'

    const retryAt = nextAttemptAt(attempts, nowMs)
    const status: DeliveryStatus = retryAt ? 'pending' : 'failed'
    await store.updateDelivery(rowId, { status, attempts, nextAttemptAt: retryAt, lastStatusCode: statusCode, lastError: error }, at)
    if (status === 'failed') await alertIfFailing(deps, hook, at)
    return { status, statusCode, error }
  } catch {
    return { status: 'failed', statusCode: null, error: 'The delivery could not be recorded.' }
  }
}

/** Sends the rows that are due, a few at a time, and removes log rows past the retention. */
export async function processDue(deps: DeliveryDeps, limit = 20): Promise<{ attempted: number; ok: number; failed: number }> {
  const nowMs = clock(deps)
  const rows = await deps.store.due(new Date(nowMs).toISOString(), limit)
  let ok = 0
  let failed = 0
  for (let i = 0; i < rows.length; i += 5) {
    const results = await Promise.all(rows.slice(i, i + 5).map((row) => attemptDelivery(deps, row.id)))
    for (const result of results) {
      if (result.status === 'ok') ok += 1
      else if (result.error) failed += 1
    }
  }
  await deps.store.pruneDeliveries(new Date(nowMs - DELIVERY_RETENTION_DAYS * 86_400_000).toISOString())
  return { attempted: rows.length, ok, failed }
}

/** The Test button: one sample delivery, sent now, ignoring the rate limit. */
export async function sendTest(deps: DeliveryDeps, webhookId: number): Promise<AttemptOutcome & { deliveryId: string | null }> {
  const hook = await deps.store.findById(webhookId)
  if (!hook) return { status: 'failed', statusCode: null, error: 'That webhook no longer exists.', deliveryId: null }
  const rowId = await queueFor(deps, hook, TEST_EVENT, TEST_DATA, { test: true })
  const row = await deps.store.findDelivery(rowId)
  const outcome = await attemptDelivery(deps, rowId)
  return { ...outcome, deliveryId: row?.deliveryId ?? null }
}

/**
 * Replay: sends a logged delivery again with its original body and delivery id, under a fresh
 * signature. Receivers that de-duplicate on X-Engage-Delivery will treat it as the same event.
 */
export async function replayDelivery(deps: DeliveryDeps, deliveryRowId: number): Promise<AttemptOutcome> {
  const original = await deps.store.findDelivery(deliveryRowId)
  if (!original) return { status: 'failed', statusCode: null, error: 'That delivery no longer exists.' }
  if (original.body === '') return { status: 'failed', statusCode: null, error: 'Nothing was prepared for this delivery, so there is nothing to send again.' }
  const hook = await deps.store.findById(original.webhookId)
  if (!hook) return { status: 'failed', statusCode: null, error: 'That webhook no longer exists.' }
  const at = new Date(clock(deps)).toISOString()
  const rowId = await deps.store.insertDelivery(
    { webhookId: hook.id, deliveryId: original.deliveryId, event: original.event, body: original.body, status: 'pending', attempts: 0, nextAttemptAt: at, lastStatusCode: null, lastError: null },
    at,
  )
  return attemptDelivery(deps, rowId)
}
