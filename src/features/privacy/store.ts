import type { D1Like } from '@/features/apiKeys'
import type { PrivacyStatus } from './core'

/**
 * D1 access for `eg_privacy_requests`. Bound statements only. `getDb` resolves the binding per call,
 * so tests pass an in-memory D1. Only the hash of the emailed token is kept.
 */

export type PrivacyRequest = {
  id: number
  userId: number | null
  email: string
  status: PrivacyStatus
  note: string
  dueAt: string
  verifyHash: string | null
  verifyExpiresAt: string | null
  verifiedAt: string | null
  decidedAt: string | null
  decidedBy: number | null
  completedAt: string | null
  result: Record<string, number> | null
  createdAt: string
  updatedAt: string
}

export type NewPrivacyRequest = {
  userId: number | null
  email: string
  status: PrivacyStatus
  dueAt: string
  verifyHash: string | null
  verifyExpiresAt: string | null
}

export type PrivacyPatch = Partial<Omit<PrivacyRequest, 'id' | 'createdAt' | 'updatedAt' | 'result'>> & { result?: Record<string, number> | null }

export type PrivacyStore = {
  list(limit: number): Promise<PrivacyRequest[]>
  findById(id: number): Promise<PrivacyRequest | null>
  findByVerifyHash(hash: string): Promise<PrivacyRequest | null>
  openForUser(userId: number): Promise<PrivacyRequest | null>
  insert(row: NewPrivacyRequest, at: string): Promise<number>
  update(id: number, patch: PrivacyPatch, at: string): Promise<void>
}

type Raw = {
  id: number
  user_id: number | null
  email: string
  status: string
  note: string
  due_at: string
  verify_hash: string | null
  verify_expires_at: string | null
  verified_at: string | null
  decided_at: string | null
  decided_by: number | null
  completed_at: string | null
  result: string | null
  created_at: string
  updated_at: string
}

const TABLE = 'eg_privacy_requests'
const OPEN = ['unverified', 'new', 'in_progress']

export function parseResult(text: string | null): Record<string, number> | null {
  if (!text) return null
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const out: Record<string, number> = {}
    for (const [key, count] of Object.entries(value as Record<string, unknown>)) if (typeof count === 'number') out[key] = count
    return out
  } catch {
    return null
  }
}

const fromRaw = (r: Raw): PrivacyRequest => ({
  id: Number(r.id),
  userId: r.user_id === null ? null : Number(r.user_id),
  email: r.email,
  status: r.status as PrivacyStatus,
  note: r.note ?? '',
  dueAt: r.due_at,
  verifyHash: r.verify_hash,
  verifyExpiresAt: r.verify_expires_at,
  verifiedAt: r.verified_at,
  decidedAt: r.decided_at,
  decidedBy: r.decided_by === null ? null : Number(r.decided_by),
  completedAt: r.completed_at,
  result: parseResult(r.result),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export function createD1PrivacyStore(getDb: () => Promise<D1Like>): PrivacyStore {
  return {
    async list(limit) {
      const d1 = await getDb()
      const rows = await d1.prepare(`SELECT * FROM ${TABLE} ORDER BY due_at ASC, id ASC LIMIT ?`).bind(limit).all<Raw>()
      return (rows.results ?? []).map(fromRaw)
    },
    async findById(id) {
      const d1 = await getDb()
      const raw = await d1.prepare(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`).bind(id).first<Raw>()
      return raw ? fromRaw(raw) : null
    },
    async findByVerifyHash(hash) {
      const d1 = await getDb()
      const raw = await d1.prepare(`SELECT * FROM ${TABLE} WHERE verify_hash = ? AND status = 'unverified' LIMIT 1`).bind(hash).first<Raw>()
      return raw ? fromRaw(raw) : null
    },
    async openForUser(userId) {
      const d1 = await getDb()
      const marks = OPEN.map(() => '?').join(', ')
      const raw = await d1
        .prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? AND status IN (${marks}) ORDER BY id DESC LIMIT 1`)
        .bind(userId, ...OPEN)
        .first<Raw>()
      return raw ? fromRaw(raw) : null
    },
    async insert(row, at) {
      const d1 = await getDb()
      const result = await d1
        .prepare(
          `INSERT INTO ${TABLE} (user_id, email, status, note, due_at, verify_hash, verify_expires_at, verified_at, decided_at, decided_by, completed_at, result, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        )
        .bind(row.userId, row.email, row.status, row.dueAt, row.verifyHash, row.verifyExpiresAt, at, at)
        .run()
      const id = (result as unknown as { meta?: { last_row_id?: number } }).meta?.last_row_id
      if (typeof id === 'number') return id
      const latest = await d1.prepare(`SELECT id FROM ${TABLE} ORDER BY id DESC LIMIT 1`).bind().first<{ id: number }>()
      return Number(latest?.id)
    },
    async update(id, patch, at) {
      const d1 = await getDb()
      const columns: Array<[string, unknown]> = []
      const map: Record<string, string> = {
        userId: 'user_id',
        email: 'email',
        status: 'status',
        note: 'note',
        dueAt: 'due_at',
        verifyHash: 'verify_hash',
        verifyExpiresAt: 'verify_expires_at',
        verifiedAt: 'verified_at',
        decidedAt: 'decided_at',
        decidedBy: 'decided_by',
        completedAt: 'completed_at',
      }
      for (const [key, column] of Object.entries(map)) {
        if (key in patch) columns.push([column, (patch as Record<string, unknown>)[key] ?? null])
      }
      if ('result' in patch) columns.push(['result', patch.result ? JSON.stringify(patch.result) : null])
      if (columns.length === 0) return
      const sets = columns.map(([column]) => `${column} = ?`).join(', ')
      await d1
        .prepare(`UPDATE ${TABLE} SET ${sets}, updated_at = ? WHERE id = ?`)
        .bind(...columns.map(([, value]) => value), at, id)
        .run()
    },
  }
}
