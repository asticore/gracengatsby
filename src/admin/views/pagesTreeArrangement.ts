import type { TreePage } from '@/features/pagesTree/plan'

export type ArrangementEntry = {
  parent: number | null
  sortOrder: number
}

/**
 * Apply a drop operation to the arrangement map.
 * Returns a new arrangement map with updated parent/sortOrder for the dragged page and affected siblings.
 *
 * zone='inside': draggedId becomes the last child of targetId
 * zone='before': draggedId becomes the previous sibling of targetId
 * zone='after': draggedId becomes the next sibling of targetId
 *
 * Renumbers sortOrder as 10,20,30... in the target sibling group.
 * Does not modify other sibling groups.
 */
export function applyDrop(
  pages: TreePage[],
  arrangement: Map<number, ArrangementEntry>,
  draggedId: number,
  targetId: number,
  zone: 'before' | 'after' | 'inside'
): Map<number, ArrangementEntry> {
  // Build current state including arrangement overrides
  const currentPages = pages.map(p => {
    const entry = arrangement.get(p.id)
    if (!entry) return p
    return { ...p, parent: entry.parent, sortOrder: entry.sortOrder }
  })

  const pageMap = new Map(currentPages.map(p => [p.id, p]))
  const draggedPage = pageMap.get(draggedId)
  const targetPage = pageMap.get(targetId)

  if (!draggedPage || !targetPage) return new Map(arrangement)

  // Guard: cannot drop into itself
  if (draggedId === targetId) return new Map(arrangement)

  // Dropping the homepage under another page is refused by planMoves, which gives the editor the reason.

  let newParent: number | null
  let newSortOrder: number

  if (zone === 'inside') {
    // draggedId becomes last child of targetId
    newParent = targetId
    const targetChildren = currentPages.filter(p => p.parent === targetId)
    const maxSort = targetChildren.length === 0 ? 0 : Math.max(...targetChildren.map(c => c.sortOrder))
    newSortOrder = maxSort + 10

    // For 'inside' zone: just update the dragged page
    const result = new Map(arrangement)
    const original = pages.find(p => p.id === draggedId)
    if (original && (original.parent !== newParent || original.sortOrder !== newSortOrder)) {
      result.set(draggedId, { parent: newParent, sortOrder: newSortOrder })
    }
    return result
  }

  // For 'before'/'after': draggedId becomes sibling of targetId
  const targetParent = targetPage.parent
  newParent = targetParent

  // Get all current siblings of target (in their current order)
  const siblings = currentPages
    .filter(p => p.parent === targetParent)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Build the new order without the dragged page, then insert it next to the target.
  const newOrder = siblings.filter(s => s.id !== draggedId)
  const targetIndex = newOrder.findIndex(s => s.id === targetId)
  const insertIndex = zone === 'before' ? targetIndex : targetIndex + 1
  newOrder.splice(insertIndex, 0, draggedPage)

  // Renumber the group, recording only the pages whose parent or order really changed.
  const result = new Map(arrangement)
  newOrder.forEach((page, idx) => {
    const newSort = (idx + 1) * 10
    const original = pages.find(p => p.id === page.id)
    if (original && original.parent === newParent && original.sortOrder === newSort) {
      result.delete(page.id)
    } else {
      result.set(page.id, { parent: newParent, sortOrder: newSort })
    }
  })

  return result
}

/**
 * Which part of a row a dragged row was released over: the top quarter drops it
 * before that row, the bottom quarter after it, the middle makes it a child.
 */
export function dropZone(pointerY: number, overTop: number, overHeight: number): 'before' | 'after' | 'inside' {
  if (overHeight <= 0) return 'inside'
  const offset = (pointerY - overTop) / overHeight
  if (offset < 0.25) return 'before'
  if (offset > 0.75) return 'after'
  return 'inside'
}
