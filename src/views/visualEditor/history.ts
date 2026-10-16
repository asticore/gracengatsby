import type { SectionNode } from '@/lib/sectionTree'

import { getList, getNode, type NodePath } from './treeOps'

/**
 * Undo/redo for the page tree. Pure: the editor keeps one History value and replaces it with
 * the result of each call. A snapshot holds the whole tree (the tree is immutable, so this is
 * just a reference per entry) plus the selection that was active when it was taken.
 */
export type Snapshot = { blocks: SectionNode[]; selectedPath: NodePath | null }

export type History = {
  past: Snapshot[]
  future: Snapshot[]
  /** Coalescing key of the most recent push, and when it happened. */
  lastKey: string | null
  lastAt: number
}

export const HISTORY_LIMIT = 100
export const COALESCE_MS = 800

export const createHistory = (): History => ({ past: [], future: [], lastKey: null, lastAt: 0 })

export const canUndo = (h: History): boolean => h.past.length > 0
export const canRedo = (h: History): boolean => h.future.length > 0

/**
 * Records `before` (the state a mutation is about to replace). Redo is cleared. When `key` is
 * given and equals the previous push's key within COALESCE_MS, no new entry is made: the
 * earlier entry already holds the state from before the burst of edits.
 */
export function pushHistory(h: History, before: Snapshot, options: { key?: string; now?: number } = {}): History {
  const now = options.now ?? Date.now()
  const key = options.key ?? null
  if (key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS && h.past.length > 0) {
    return { ...h, future: [], lastAt: now }
  }
  const past = [...h.past, before]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { past, future: [], lastKey: key, lastAt: now }
}

/** Steps back. `current` is what is on screen now (it becomes the redo entry). Null when empty. */
export function undoHistory(h: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  if (h.past.length === 0) return null
  const snapshot = h.past[h.past.length - 1]
  return {
    snapshot,
    history: { past: h.past.slice(0, -1), future: [...h.future, current], lastKey: null, lastAt: 0 },
  }
}

export function redoHistory(h: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  if (h.future.length === 0) return null
  const snapshot = h.future[h.future.length - 1]
  return {
    snapshot,
    history: { past: [...h.past, current], future: h.future.slice(0, -1), lastKey: null, lastAt: 0 },
  }
}

/**
 * Keeps a selection valid against a tree: the path itself when it still resolves, else the
 * nearest sibling in the same list, else the parent, else null.
 */
export function clampPath(blocks: SectionNode[], path: NodePath | null): NodePath | null {
  if (!path || path.length === 0) return null
  let current: NodePath = path
  while (current.length > 0) {
    if (current.length % 2 === 1) {
      if (getNode(blocks, current)) return current
      const container = current.slice(0, -1)
      const list = getList(blocks, container)
      if (list && list.length > 0) return [...container, Math.min(current[current.length - 1], list.length - 1)]
      current = container.slice(0, -1)
    } else {
      const owner = getNode(blocks, current.slice(0, -1))
      if (owner?.columns?.[current[current.length - 1]]) return current
      current = current.slice(0, -1)
    }
  }
  return null
}
