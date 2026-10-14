/**
 * Editor-side view of section locks (rules and server enforcement: src/features/roles/locks.ts).
 * Pure helpers: what is locked, and may this person edit through it. The server is the authority;
 * this only decides what to show and which actions to disable.
 */
import type { SectionNode } from '@/lib/sectionTree'
import { canBypassLock, nodeKey, type LockEntry, type LockMode, type LockUser, type Locks } from '@/features/roles/locks'

import { pathKey, type NodePath } from './treeOps'

export type EffectiveLock = {
  mode: LockMode
  editableProps: string[]
  source: 'self' | 'inherited' | 'document'
  label: string
  /** True when this person cannot edit through it. */
  blocked: boolean
  unlockRoles: string[]
}

const labelOf = (entry: LockEntry, node?: SectionNode): string => entry.label || node?.blockType || 'section'

/** Top-level blocks are keyed by their saved id (none until first save); nested ones by their editor id. */
export function lockKeyOf(node: SectionNode | undefined, path: NodePath): string | undefined {
  if (!node) return undefined
  if (path.length === 1 && !(typeof node.id === 'string' || typeof node.id === 'number')) return undefined
  return nodeKey(node)
}

function combine(found: EffectiveLock[]): EffectiveLock | null {
  if (found.length === 0) return null
  const blockedOnes = found.filter((f) => f.blocked)
  const pool = blockedOnes.length > 0 ? blockedOnes : found
  const full = pool.find((f) => f.mode === 'full')
  if (full) return full
  const editable = pool.reduce<string[] | null>((acc, f) => (acc === null ? [...f.editableProps] : acc.filter((p) => f.editableProps.includes(p))), null)
  return { ...pool[0], editableProps: editable ?? [] }
}

/** The lock that applies to the node at `path` (its own, an ancestor's, or the document's). */
export function effectiveLock(blocks: SectionNode[], path: NodePath, locks: Locks, user: LockUser): EffectiveLock | null {
  const found: EffectiveLock[] = []
  if (locks.document) {
    found.push({
      mode: locks.document.mode,
      editableProps: locks.document.editableProps,
      source: 'document',
      label: locks.document.label || 'This document',
      blocked: !canBypassLock(user, locks.document),
      unlockRoles: locks.document.unlockRoles,
    })
  }
  let list: SectionNode[] = blocks
  for (let i = 0; i < path.length; i += 2) {
    const node = list[path[i]]
    if (!node) break
    const key = nodeKey(node)
    const entry = key ? locks.nodes[key] : undefined
    if (entry) {
      found.push({
        mode: entry.mode,
        editableProps: entry.editableProps,
        source: i === path.length - 1 ? 'self' : 'inherited',
        label: labelOf(entry, node),
        blocked: !canBypassLock(user, entry),
        unlockRoles: entry.unlockRoles,
      })
    }
    if (i + 1 < path.length) list = node.columns?.[path[i + 1]]?.blocks ?? []
  }
  return combine(found)
}

type CanvasLockInfo = { mode: LockMode; blocked: boolean }

/** Lock state of every locked node (and everything inside it), keyed by pathKey, for the canvas. */
export function lockMapForCanvas(blocks: SectionNode[], locks: Locks, user: LockUser): Record<string, CanvasLockInfo> {
  const out: Record<string, CanvasLockInfo> = {}
  if (!locks.document && Object.keys(locks.nodes).length === 0) return out
  const walk = (nodes: SectionNode[], base: NodePath) => {
    nodes.forEach((node, index) => {
      const path = [...base, index]
      const lock = effectiveLock(blocks, path, locks, user)
      if (lock) out[pathKey(path)] = { mode: lock.mode, blocked: lock.blocked }
      node.columns?.forEach((column, ci) => walk(column.blocks ?? [], [...path, ci]))
    })
  }
  walk(blocks, [])
  return out
}

/** May a block be put into this container (path [] = the page, otherwise a column path)? */
export function canInsertInto(blocks: SectionNode[], containerPath: NodePath, locks: Locks, user: LockUser): boolean {
  if (containerPath.length === 0) return !(locks.document && !canBypassLock(user, locks.document))
  const owner = effectiveLock(blocks, containerPath.slice(0, -1), locks, user)
  return !(owner && owner.blocked)
}

export function withNodeLock(locks: Locks, key: string, entry: LockEntry | null): Locks {
  const nodes = { ...locks.nodes }
  if (entry) nodes[key] = entry
  else delete nodes[key]
  return { ...locks, nodes }
}

export const lockedKeySet = (locks: Locks): Set<string> => new Set(Object.keys(locks.nodes))
