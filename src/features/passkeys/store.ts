import { resolveD1Binding } from '@/cms/db/connect'

/**
 * `eg_passkeys`: one row per registered credential. Plain bound statements, like
 * the login-token and social tables, so sign-in never depends on the schema
 * generator. The core takes a `PasskeyStore` so tests can swap it.
 */

export type PasskeyRow = {
  id: number
  userId: number
  credentialId: string
  /** base64url of the COSE_Key bytes the authenticator sent at registration. */
  publicKey: string
  signCount: number
  transports: string[]
  deviceLabel: string | null
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

export type NewPasskey = Omit<PasskeyRow, 'id' | 'lastUsedAt'>

export type PasskeyStore = {
  insert(row: NewPasskey): Promise<number>
  findByCredentialId(credentialId: string): Promise<PasskeyRow | null>
  listForUser(userId: number): Promise<PasskeyRow[]>
  findForUser(userId: number, id: number): Promise<PasskeyRow | null>
  recordUse(id: number, signCount: number, at: string): Promise<void>
  rename(id: number, deviceLabel: string): Promise<void>
  remove(id: number): Promise<void>
}

type Raw = {
  id: number
  user_id: number
  credential_id: string
  public_key: string
  sign_count: number
  transports: string | null
  device_label: string | null
  backed_up: number
  created_at: string
  last_used_at: string | null
}

const TABLE = '`eg_passkeys`'

const toRow = (r: Raw): PasskeyRow => ({
  id: Number(r.id),
  userId: Number(r.user_id),
  credentialId: r.credential_id,
  publicKey: r.public_key,
  signCount: Number(r.sign_count ?? 0),
  transports: parseTransports(r.transports),
  deviceLabel: r.device_label ?? null,
  backedUp: Number(r.backed_up ?? 0) === 1,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at ?? null,
})

const parseTransports = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

export const defaultPasskeyStore: PasskeyStore = {
  async insert(row) {
    const d1 = await resolveD1Binding()
    const result = await d1
      .prepare(
        `INSERT INTO ${TABLE} (user_id, credential_id, public_key, sign_count, transports, device_label, backed_up, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        row.userId,
        row.credentialId,
        row.publicKey,
        row.signCount,
        JSON.stringify(row.transports),
        row.deviceLabel,
        row.backedUp ? 1 : 0,
        row.createdAt,
      )
      .run()
    return Number(result.meta?.last_row_id ?? 0)
  },
  async findByCredentialId(credentialId) {
    const d1 = await resolveD1Binding()
    const raw = await d1.prepare(`SELECT * FROM ${TABLE} WHERE credential_id = ? LIMIT 1`).bind(credentialId).first<Raw>()
    return raw ? toRow(raw) : null
  },
  async listForUser(userId) {
    const d1 = await resolveD1Binding()
    const rows = await d1.prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? ORDER BY id ASC`).bind(userId).all<Raw>()
    return (rows.results ?? []).map(toRow)
  },
  async findForUser(userId, id) {
    const d1 = await resolveD1Binding()
    const raw = await d1.prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? AND id = ? LIMIT 1`).bind(userId, id).first<Raw>()
    return raw ? toRow(raw) : null
  },
  async recordUse(id, signCount, at) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${TABLE} SET sign_count = ?, last_used_at = ? WHERE id = ?`).bind(signCount, at, id).run()
  },
  async rename(id, deviceLabel) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${TABLE} SET device_label = ? WHERE id = ?`).bind(deviceLabel, id).run()
  },
  async remove(id) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).bind(id).run()
  },
}
