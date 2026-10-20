import type { SectionNode } from '@/lib/sectionTree'

import type { BlockDef } from './blockSchemas'
import { getList, splitPath, type NodePath } from './treeOps'

/**
 * Pure helpers for the "/" quick insert palette. The entries are the element library's own cards
 * (libraryCards in blockSchemas.ts); nothing is duplicated here.
 */

type Card = Pick<BlockDef, 'slug' | 'label' | 'description'>

/**
 * Filters and ranks cards for `query`. Empty query: recents first (in recent order), then the rest in library order.
 * Otherwise: label starts-with > label word starts-with > label contains > slug contains > description contains;
 * ties keep recents first, then library order.
 */
export function filterQuickInsert<T extends Card>(cards: readonly T[], query: string, recents: readonly string[] = [], limit = 50): T[] {
  const needle = query.trim().toLowerCase()
  const recentRank = (slug: string) => {
    const i = recents.indexOf(slug)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const scored: { card: T; score: number; order: number }[] = []
  cards.forEach((card, order) => {
    if (!needle) {
      scored.push({ card, score: 0, order })
      return
    }
    const label = card.label.toLowerCase()
    const slug = card.slug.toLowerCase()
    let score = -1
    if (label.startsWith(needle)) score = 0
    else if (label.split(/[\s-]+/).some((w) => w.startsWith(needle))) score = 1
    else if (label.includes(needle)) score = 2
    else if (slug.includes(needle)) score = 3
    else if ((card.description || '').toLowerCase().includes(needle)) score = 4
    if (score >= 0) scored.push({ card, score, order })
  })
  scored.sort((a, b) => a.score - b.score || recentRank(a.card.slug) - recentRank(b.card.slug) || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.card)
}

/** Next/previous highlighted row, wrapping. */
export function moveHighlight(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return 0
  return (current + delta + count) % count
}

/** Where a quick insert lands: after the selected block, at the end of a selected column, else the end of the page. */
export function quickInsertTarget(blocks: SectionNode[], selected: NodePath | null): { containerPath: NodePath; at: number } {
  if (selected && selected.length > 0) {
    if (selected.length % 2 === 1) {
      const { containerPath, index } = splitPath(selected)
      return { containerPath, at: index + 1 }
    }
    return { containerPath: selected, at: getList(blocks, selected)?.length ?? 0 }
  }
  return { containerPath: [], at: blocks.length }
}
