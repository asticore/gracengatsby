/**
 * Local draft recovery for the visual editor. A copy of the unsaved block tree is kept in this browser
 * (localStorage, keyed per site, surface and document) so that a session that expires or a closed tab does
 * not lose edits. The draft is only offered back on the next open of that document; it is never applied
 * on its own. A save clears it.
 *
 * Rules: a draft that holds a password, token, secret, api key or data: URL is not kept at all (a partial
 * copy would restore a damaged page). Storage is always wrapped in try/catch: when it is missing or full the
 * editor works without recovery.
 */

import type { SectionNode } from '@/lib/sectionTree'
import { stripEditorIds } from './treeOps'

export const BLOCK_DRAFT_PREFIX = 'eg-ve-draft'
export const BLOCK_DRAFT_VERSION = 1
/** Characters (about bytes for ASCII) of JSON allowed per draft. Larger trees are not kept. */
export const BLOCK_DRAFT_MAX_CHARS = 2_000_000

const SECRET_NAME = /pass|secret|token|api[-_]?key|otp|credential|private[-_]?key/i

export type BlockDraft = { savedAt: string; blocks: SectionNode[] }

export function blockDraftKey(surfaceSlug: string, id: number | string, siteOrigin: string): string {
  return [BLOCK_DRAFT_PREFIX, siteOrigin.replace(/\/+$/, ''), surfaceSlug, String(id)].join('|')
}

/** The tree as it is saved (editor ids removed), as JSON. Two trees with the same JSON have the same content. */
export function comparableTree(blocks: SectionNode[]): string {
  return JSON.stringify(stripEditorIds(blocks))
}

/** True when the tree holds nothing a draft must not keep (secret-named keys or data: URLs), at any depth. */
export function holdsSensitiveData(value: unknown, depth = 0): boolean {
  if (depth > 64) return true
  if (typeof value === 'string') return value.startsWith('data:')
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => holdsSensitiveData(item, depth + 1))
  return Object.entries(value).some(([key, item]) => SECRET_NAME.test(key) || holdsSensitiveData(item, depth + 1))
}

/** Stores the unsaved tree. Returns false (and stores nothing new) when it cannot be kept. */
export function writeBlockDraft(key: string, blocks: SectionNode[], now: number): boolean {
  try {
    const clean = stripEditorIds(blocks)
    if (holdsSensitiveData(clean)) return false
    const json = JSON.stringify({ version: BLOCK_DRAFT_VERSION, savedAt: new Date(now).toISOString(), blocks: clean })
    if (json.length > BLOCK_DRAFT_MAX_CHARS) {
      clearBlockDraft(key)
      return false
    }
    window.localStorage.setItem(key, json)
    return true
  } catch {
    return false
  }
}

/** The stored draft, or null when there is none, it is damaged, or it is from another version. Never throws. */
export function readBlockDraft(key: string): BlockDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw || raw.length > BLOCK_DRAFT_MAX_CHARS * 2) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    if (record.version !== BLOCK_DRAFT_VERSION || typeof record.savedAt !== 'string' || Number.isNaN(Date.parse(record.savedAt))) return null
    if (!Array.isArray(record.blocks) || holdsSensitiveData(record.blocks)) return null
    return { savedAt: record.savedAt, blocks: record.blocks as SectionNode[] }
  } catch {
    return null
  }
}

export function clearBlockDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/** True when the draft was written after the server copy and differs from it. */
export function draftNeedsOffer(draft: BlockDraft, serverBlocks: SectionNode[], serverUpdatedAt?: string | null): boolean {
  if (serverUpdatedAt) {
    const server = Date.parse(serverUpdatedAt)
    if (!Number.isNaN(server) && Date.parse(draft.savedAt) <= server) return false
  }
  return comparableTree(draft.blocks) !== comparableTree(serverBlocks)
}
