/**
 * Pure rules for local draft recovery on admin edit screens: the storage key,
 * what may be kept, the size cap, parsing a stored copy back, and when an
 * autosave is due. No browser APIs are used here; the storage calls and the
 * banner live in src/admin/edit/useLocalDraft.tsx.
 *
 * A draft lives only in this browser, per site and per document. It never
 * holds passwords, tokens or uploaded files.
 */

export const DRAFT_VERSION = 1
export const DRAFT_PREFIX = 'eg-edit-draft'
export const MAX_DRAFT_BYTES = 500 * 1024
export const AUTOSAVE_MS = 5000

const MAX_DEPTH = 8

/** Field names that must never be written to local storage (checked at every depth). */
const SECRET_NAME = /pass|secret|token|api[-_]?key|otp|credential|private[-_]?key/i

/** Keys that would reach into the object prototype when a stored copy is read back. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export type DraftValues = Record<string, unknown>

export type DraftSnapshot = { values: DraftValues; savedAt: string; version: number }

/** Storage key for one document on one site. `id` is omitted (or 'new') for a document not yet saved. */
export function draftKey(collection: string, id: number | string | undefined, siteOrigin: string): string {
  const idPart = id === undefined || id === '' || id === 'new' ? 'new' : String(id)
  return [DRAFT_PREFIX, siteOrigin.replace(/\/+$/, ''), collection, idPart].join('|')
}

function isBinary(value: unknown): boolean {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
}

/** A JSON-safe copy of one value, or undefined when it must not be kept. */
function cleanValue(value: unknown, depth: number): unknown {
  if (value === null) return null
  if (typeof value === 'string') return value.startsWith('data:') ? undefined : value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (typeof value !== 'object' || depth >= MAX_DEPTH || isBinary(value)) return undefined
  if (Array.isArray(value)) {
    return value.map((item) => {
      const cleaned = cleanValue(item, depth + 1)
      return cleaned === undefined ? null : cleaned
    })
  }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_NAME.test(key) || UNSAFE_KEYS.has(key)) continue
    const cleaned = cleanValue(item, depth + 1)
    if (cleaned !== undefined) out[key] = cleaned
  }
  return out
}

/** Keeps only plain JSON data: drops passwords and secrets at any depth, files, blobs, data: URLs and functions. */
export function sanitiseDraftValues(values: unknown): DraftValues {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  const cleaned = cleanValue(values, 0)
  return cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) ? (cleaned as DraftValues) : {}
}

/** Length in UTF-8 bytes, without encoding the whole string. */
function utf8Length(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

/**
 * The stored form of a snapshot, or null when there is nothing worth keeping
 * or the snapshot is over the size cap. The caller then drops any older copy.
 */
export function serialiseDraft(values: unknown, now: number): string | null {
  const snapshot: DraftSnapshot = { savedAt: new Date(now).toISOString(), values: sanitiseDraftValues(values), version: DRAFT_VERSION }
  if (Object.keys(snapshot.values).length === 0) return null
  const json = JSON.stringify(snapshot)
  return utf8Length(json) <= MAX_DRAFT_BYTES ? json : null
}

/** A stored copy read back, or null when it is missing, damaged, from another version, or empty. Never throws. */
export function parseDraft(raw: unknown): DraftSnapshot | null {
  if (typeof raw !== 'string' || raw.length === 0 || utf8Length(raw) > MAX_DRAFT_BYTES * 2) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (record.version !== DRAFT_VERSION) return null
  if (typeof record.savedAt !== 'string' || Number.isNaN(Date.parse(record.savedAt))) return null
  // Read through the same rules as a save, so a hand-edited copy cannot bring a secret back.
  const values = sanitiseDraftValues(record.values)
  if (Object.keys(values).length === 0) return null
  return { savedAt: record.savedAt, values, version: DRAFT_VERSION }
}

/**
 * True when the draft holds changes made after the server's copy was last
 * written. With no server time (a new document) any draft counts.
 */
export function isNewerThanServer(draft: DraftSnapshot, serverUpdatedAt?: string | null): boolean {
  const draftTime = Date.parse(draft.savedAt)
  if (Number.isNaN(draftTime)) return false
  if (!serverUpdatedAt) return true
  const serverTime = Date.parse(serverUpdatedAt)
  if (Number.isNaN(serverTime)) return true
  return draftTime > serverTime
}

/** An autosave is due when the form has changes and the last one (lastSaved, ms) is at least minGapMs ago, or there was none. */
export function shouldAutosave(dirty: boolean, lastSaved: number | null, now: number, minGapMs: number): boolean {
  if (!dirty) return false
  if (lastSaved === null) return true
  return now - lastSaved >= minGapMs
}
