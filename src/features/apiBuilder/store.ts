import type { ApiEndpoint, ApiEndpointConfig } from './core'
import type { D1Like } from '@/features/apiKeys'

/**
 * D1 access for custom endpoints and their call log. Bound statements only. `getDb`
 * resolves the binding per call, like the API key store, so tests pass an in-memory D1.
 * The config is stored as one JSON column; a row whose JSON no longer parses is skipped, not thrown.
 */

export type EndpointStore = {
  list(): Promise<ApiEndpoint[]>
  findByPath(version: string, slug: string): Promise<ApiEndpoint | null>
  findById(id: number): Promise<ApiEndpoint | null>
  insert(config: ApiEndpointConfig, at: string): Promise<number>
  update(id: number, config: ApiEndpointConfig, at: string): Promise<void>
  remove(id: number): Promise<void>
  count(): Promise<number>
  logCall(entry: CallLogEntry): Promise<void>
  pruneLog(beforeIso: string): Promise<void>
  recentCalls(endpointId: number, limit: number): Promise<CallLogEntry[]>
  /** The public docs switch and its token. Creates the one row, with a fresh token, on first read. */
  docsSettings(): Promise<{ docsPublic: boolean; docsToken: string }>
  setDocsPublic(enabled: boolean, at: string): Promise<void>
  regenerateDocsToken(at: string): Promise<string>
}

/** A random 32-character lower-case hex token for the public docs link. */
export function newDocsToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export type CallLogEntry = {
  endpointId: number
  keyId: number | null
  userId: number | null
  method: string
  status: number
  createdAt: string
}

type Raw = { id: number; version: string; slug: string; name: string; collection: string; config: string; enabled: number; created_at: string; updated_at: string }

/** Parses one stored row. Returns null when the JSON is damaged, so one bad row never breaks the list. */
export function rowToEndpoint(r: Raw): ApiEndpoint | null {
  let config: Partial<ApiEndpointConfig>
  try {
    config = JSON.parse(r.config) as Partial<ApiEndpointConfig>
  } catch {
    return null
  }
  return {
    ...(config as ApiEndpointConfig),
    id: Number(r.id),
    version: r.version,
    slug: r.slug,
    name: r.name,
    collection: r.collection,
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const TABLE = '`eg_api_endpoints`'
const LOG = '`eg_api_endpoint_log`'
const COLUMNS = 'id, version, slug, name, collection, config, enabled, created_at, updated_at'

export function createD1EndpointStore(getDb: () => Promise<D1Like>): EndpointStore {
  const all = async (sql: string, ...values: unknown[]): Promise<Raw[]> => {
    const db = await getDb()
    const result = await db.prepare(sql).bind(...values).all<Raw>()
    return result.results ?? []
  }
  const first = async (sql: string, ...values: unknown[]): Promise<Raw | null> => {
    const db = await getDb()
    return db.prepare(sql).bind(...values).first<Raw>()
  }
  const toList = (rows: Raw[]): ApiEndpoint[] => rows.map(rowToEndpoint).filter((e): e is ApiEndpoint => e !== null)

  return {
    async list() {
      return toList(await all(`SELECT ${COLUMNS} FROM ${TABLE} ORDER BY name COLLATE NOCASE`))
    },
    async findByPath(version, slug) {
      const row = await first(`SELECT ${COLUMNS} FROM ${TABLE} WHERE version = ? AND slug = ?`, version, slug)
      return row ? rowToEndpoint(row) : null
    },
    async findById(id) {
      const row = await first(`SELECT ${COLUMNS} FROM ${TABLE} WHERE id = ?`, id)
      return row ? rowToEndpoint(row) : null
    },
    async insert(config, at) {
      const db = await getDb()
      const result = (await db
        .prepare(`INSERT INTO ${TABLE} (version, slug, name, collection, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(config.version, config.slug, config.name, config.collection, JSON.stringify(config), config.enabled ? 1 : 0, at, at)
        .run()) as { meta?: { last_row_id?: number } }
      return Number(result.meta?.last_row_id ?? 0)
    },
    async update(id, config, at) {
      const db = await getDb()
      await db
        .prepare(`UPDATE ${TABLE} SET version = ?, slug = ?, name = ?, collection = ?, config = ?, enabled = ?, updated_at = ? WHERE id = ?`)
        .bind(config.version, config.slug, config.name, config.collection, JSON.stringify(config), config.enabled ? 1 : 0, at, id)
        .run()
    },
    async remove(id) {
      const db = await getDb()
      await db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).bind(id).run()
      await db.prepare(`DELETE FROM ${LOG} WHERE endpoint_id = ?`).bind(id).run()
    },
    async count() {
      const row = await first(`SELECT COUNT(*) AS n FROM ${TABLE}`)
      return row ? Number((row as unknown as { n: number }).n) : 0
    },
    async logCall(entry) {
      const db = await getDb()
      await db
        .prepare(`INSERT INTO ${LOG} (endpoint_id, key_id, user_id, method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(entry.endpointId, entry.keyId, entry.userId, entry.method, entry.status, entry.createdAt)
        .run()
    },
    async pruneLog(beforeIso) {
      const db = await getDb()
      await db.prepare(`DELETE FROM ${LOG} WHERE created_at < ?`).bind(beforeIso).run()
    },
    async recentCalls(endpointId, limit) {
      const rows = await all(
        `SELECT endpoint_id, key_id, user_id, method, status, created_at FROM ${LOG} WHERE endpoint_id = ? ORDER BY id DESC LIMIT ?`,
        endpointId,
        Math.max(1, Math.min(200, limit)),
      )
      return (rows as unknown as Array<{ endpoint_id: number; key_id: number | null; user_id: number | null; method: string; status: number; created_at: string }>).map((r) => ({
        endpointId: Number(r.endpoint_id),
        keyId: r.key_id === null ? null : Number(r.key_id),
        userId: r.user_id === null ? null : Number(r.user_id),
        method: r.method,
        status: Number(r.status),
        createdAt: r.created_at,
      }))
    },
    async docsSettings() {
      const row = (await first('SELECT docs_public, docs_token FROM `eg_api_builder_settings` WHERE id = 1')) as unknown as { docs_public: number; docs_token: string } | null
      if (row) return { docsPublic: Boolean(row.docs_public), docsToken: row.docs_token }
      const token = newDocsToken()
      const db = await getDb()
      await db.prepare('INSERT OR IGNORE INTO `eg_api_builder_settings` (id, docs_public, docs_token, updated_at) VALUES (1, 0, ?, ?)').bind(token, new Date().toISOString()).run()
      const again = (await first('SELECT docs_public, docs_token FROM `eg_api_builder_settings` WHERE id = 1')) as unknown as { docs_public: number; docs_token: string } | null
      return { docsPublic: Boolean(again?.docs_public), docsToken: again?.docs_token ?? token }
    },
    async setDocsPublic(enabled, at) {
      const db = await getDb()
      await db.prepare('UPDATE `eg_api_builder_settings` SET docs_public = ?, updated_at = ? WHERE id = 1').bind(enabled ? 1 : 0, at).run()
    },
    async regenerateDocsToken(at) {
      const db = await getDb()
      const token = newDocsToken()
      await db.prepare('UPDATE `eg_api_builder_settings` SET docs_token = ?, updated_at = ? WHERE id = 1').bind(token, at).run()
      return token
    },
  }
}

/** Keeps the call log to 30 days. Called on a small share of writes, never on the request's critical path. */
export const CALL_LOG_RETENTION_MS = 30 * 86_400_000
