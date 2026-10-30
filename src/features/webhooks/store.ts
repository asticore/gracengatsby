import type { D1Like } from '@/features/apiKeys'
import type { DeliveryStatus, WebhookConfig } from './core'
import type { WebhookEvent } from './events'

/**
 * D1 access for webhooks and their delivery log. Bound statements only. `getDb` resolves the binding
 * per call, so tests pass an in-memory D1. The signing secret is stored encrypted (see ./secret.ts);
 * this file never sees it in clear. A row whose JSON is damaged is skipped, not thrown.
 */

export type WebhookRecord = WebhookConfig & {
  id: number
  /** The encrypted signing secret (enc:v1:...). Never returned to the browser. */
  secret: string
  createdAt: string
  updatedAt: string
}

export type DeliveryRecord = {
  id: number
  webhookId: number
  deliveryId: string
  event: string
  /** The exact body sent (or to be sent). Kept for replay; holds no signing secret. */
  body: string
  status: DeliveryStatus
  attempts: number
  nextAttemptAt: string | null
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type NewDelivery = Pick<DeliveryRecord, 'webhookId' | 'deliveryId' | 'event' | 'body' | 'status' | 'attempts' | 'nextAttemptAt' | 'lastStatusCode' | 'lastError'>

export type DeliveryPatch = Partial<Pick<DeliveryRecord, 'status' | 'attempts' | 'nextAttemptAt' | 'lastStatusCode' | 'lastError'>>

export type WebhookStore = {
  list(): Promise<WebhookRecord[]>
  findById(id: number): Promise<WebhookRecord | null>
  /** Enabled webhooks subscribed to one event. */
  activeFor(event: WebhookEvent): Promise<WebhookRecord[]>
  count(): Promise<number>
  insert(config: WebhookConfig, secret: string, at: string): Promise<number>
  update(id: number, config: WebhookConfig, at: string): Promise<void>
  setSecret(id: number, secret: string, at: string): Promise<void>
  remove(id: number): Promise<void>
  insertDelivery(row: NewDelivery, at: string): Promise<number>
  updateDelivery(id: number, patch: DeliveryPatch, at: string): Promise<void>
  findDelivery(id: number): Promise<DeliveryRecord | null>
  listDeliveries(webhookId: number, limit: number): Promise<DeliveryRecord[]>
  lastDelivery(webhookId: number): Promise<DeliveryRecord | null>
  /** Pending deliveries whose next try is due, oldest first. */
  due(nowIso: string, limit: number): Promise<DeliveryRecord[]>
  /** Deliveries queued for one webhook since a time (skipped ones not counted). Feeds the rate limit. */
  queuedSince(webhookId: number, sinceIso: string): Promise<number>
  pruneDeliveries(beforeIso: string): Promise<void>
}

type RawWebhook = { id: number; name: string; description: string; url: string; events: string; template: string | null; secret: string; enabled: number; rate_per_minute: number; created_at: string; updated_at: string }
type RawDelivery = { id: number; webhook_id: number; delivery_id: string; event: string; body: string; status: string; attempts: number; next_attempt_at: string | null; last_status_code: number | null; last_error: string | null; created_at: string; updated_at: string }

const WEBHOOK_COLUMNS = 'id, name, description, url, events, template, secret, enabled, rate_per_minute, created_at, updated_at'
const DELIVERY_COLUMNS = 'id, webhook_id, delivery_id, event, body, status, attempts, next_attempt_at, last_status_code, last_error, created_at, updated_at'
const WEBHOOKS = '`eg_webhooks`'
const DELIVERIES = '`eg_webhook_deliveries`'

/** Parses one stored webhook. Null when its event list is damaged, so one bad row never breaks the list. */
export function rowToWebhook(r: RawWebhook): WebhookRecord | null {
  let events: unknown
  try {
    events = JSON.parse(r.events)
  } catch {
    return null
  }
  if (!Array.isArray(events)) return null
  return {
    id: Number(r.id),
    name: r.name,
    description: r.description,
    url: r.url,
    events: events as WebhookEvent[],
    template: r.template,
    secret: r.secret,
    enabled: Boolean(r.enabled),
    ratePerMinute: Number(r.rate_per_minute),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const toDelivery = (r: RawDelivery): DeliveryRecord => ({
  id: Number(r.id),
  webhookId: Number(r.webhook_id),
  deliveryId: r.delivery_id,
  event: r.event,
  body: r.body,
  status: r.status as DeliveryStatus,
  attempts: Number(r.attempts),
  nextAttemptAt: r.next_attempt_at,
  lastStatusCode: r.last_status_code === null ? null : Number(r.last_status_code),
  lastError: r.last_error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function createD1WebhookStore(getDb: () => Promise<D1Like>): WebhookStore {
  const all = async <T>(sql: string, ...values: unknown[]): Promise<T[]> => {
    const db = await getDb()
    const result = await db.prepare(sql).bind(...values).all<T>()
    return result.results ?? []
  }
  const first = async <T>(sql: string, ...values: unknown[]): Promise<T | null> => {
    const db = await getDb()
    return db.prepare(sql).bind(...values).first<T>()
  }
  const run = async (sql: string, ...values: unknown[]): Promise<void> => {
    const db = await getDb()
    await db.prepare(sql).bind(...values).run()
  }

  return {
    async list() {
      const rows = await all<RawWebhook>(`SELECT ${WEBHOOK_COLUMNS} FROM ${WEBHOOKS} ORDER BY name COLLATE NOCASE`)
      return rows.map(rowToWebhook).filter((w): w is WebhookRecord => w !== null)
    },
    async findById(id) {
      const row = await first<RawWebhook>(`SELECT ${WEBHOOK_COLUMNS} FROM ${WEBHOOKS} WHERE id = ?`, id)
      return row ? rowToWebhook(row) : null
    },
    async activeFor(event) {
      // The event list is a JSON array of plain names, so a quoted-name match is exact.
      const rows = await all<RawWebhook>(`SELECT ${WEBHOOK_COLUMNS} FROM ${WEBHOOKS} WHERE enabled = 1 AND events LIKE ?`, `%"${event}"%`)
      return rows.map(rowToWebhook).filter((w): w is WebhookRecord => w !== null && w.events.includes(event))
    },
    async count() {
      const row = await first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${WEBHOOKS}`)
      return row ? Number(row.n) : 0
    },
    async insert(config, secret, at) {
      const db = await getDb()
      const result = (await db
        .prepare(`INSERT INTO ${WEBHOOKS} (name, description, url, events, template, secret, enabled, rate_per_minute, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(config.name, config.description, config.url, JSON.stringify(config.events), config.template, secret, config.enabled ? 1 : 0, config.ratePerMinute, at, at)
        .run()) as { meta?: { last_row_id?: number } }
      return Number(result.meta?.last_row_id ?? 0)
    },
    async update(id, config, at) {
      await run(
        `UPDATE ${WEBHOOKS} SET name = ?, description = ?, url = ?, events = ?, template = ?, enabled = ?, rate_per_minute = ?, updated_at = ? WHERE id = ?`,
        config.name,
        config.description,
        config.url,
        JSON.stringify(config.events),
        config.template,
        config.enabled ? 1 : 0,
        config.ratePerMinute,
        at,
        id,
      )
    },
    async setSecret(id, secret, at) {
      await run(`UPDATE ${WEBHOOKS} SET secret = ?, updated_at = ? WHERE id = ?`, secret, at, id)
    },
    async remove(id) {
      await run(`DELETE FROM ${DELIVERIES} WHERE webhook_id = ?`, id)
      await run(`DELETE FROM ${WEBHOOKS} WHERE id = ?`, id)
    },
    async insertDelivery(row, at) {
      const db = await getDb()
      const result = (await db
        .prepare(`INSERT INTO ${DELIVERIES} (webhook_id, delivery_id, event, body, status, attempts, next_attempt_at, last_status_code, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(row.webhookId, row.deliveryId, row.event, row.body, row.status, row.attempts, row.nextAttemptAt, row.lastStatusCode, row.lastError, at, at)
        .run()) as { meta?: { last_row_id?: number } }
      return Number(result.meta?.last_row_id ?? 0)
    },
    async updateDelivery(id, patch, at) {
      const current = await first<RawDelivery>(`SELECT ${DELIVERY_COLUMNS} FROM ${DELIVERIES} WHERE id = ?`, id)
      if (!current) return
      const next = { ...toDelivery(current), ...patch }
      await run(
        `UPDATE ${DELIVERIES} SET status = ?, attempts = ?, next_attempt_at = ?, last_status_code = ?, last_error = ?, updated_at = ? WHERE id = ?`,
        next.status,
        next.attempts,
        next.nextAttemptAt,
        next.lastStatusCode,
        next.lastError,
        at,
        id,
      )
    },
    async findDelivery(id) {
      const row = await first<RawDelivery>(`SELECT ${DELIVERY_COLUMNS} FROM ${DELIVERIES} WHERE id = ?`, id)
      return row ? toDelivery(row) : null
    },
    async listDeliveries(webhookId, limit) {
      const rows = await all<RawDelivery>(`SELECT ${DELIVERY_COLUMNS} FROM ${DELIVERIES} WHERE webhook_id = ? ORDER BY id DESC LIMIT ?`, webhookId, Math.max(1, Math.min(200, limit)))
      return rows.map(toDelivery)
    },
    async lastDelivery(webhookId) {
      const row = await first<RawDelivery>(`SELECT ${DELIVERY_COLUMNS} FROM ${DELIVERIES} WHERE webhook_id = ? ORDER BY id DESC LIMIT 1`, webhookId)
      return row ? toDelivery(row) : null
    },
    async due(nowIso, limit) {
      const rows = await all<RawDelivery>(
        `SELECT ${DELIVERY_COLUMNS} FROM ${DELIVERIES} WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at ASC LIMIT ?`,
        nowIso,
        Math.max(1, Math.min(100, limit)),
      )
      return rows.map(toDelivery)
    },
    async queuedSince(webhookId, sinceIso) {
      const row = await first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${DELIVERIES} WHERE webhook_id = ? AND status != 'skipped' AND created_at >= ?`, webhookId, sinceIso)
      return row ? Number(row.n) : 0
    },
    async pruneDeliveries(beforeIso) {
      await run(`DELETE FROM ${DELIVERIES} WHERE created_at < ?`, beforeIso)
    },
  }
}
