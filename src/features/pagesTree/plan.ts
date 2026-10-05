export const MAX_DEPTH = 8

export type TreePage = {
  id: number
  title: string
  slug: string
  parent: number | null
  sortOrder: number
  isHomepage: boolean
  status: 'published' | 'draft'
}

export type MoveInput = {
  id: number
  parent: number | null
  sortOrder: number
}

export type TreeNode = {
  page: TreePage
  children: TreeNode[]
  depth: number
}

export type PlannedMove = {
  id: number
  title: string
  oldParent: number | null
  newParent: number | null
  oldSortOrder: number
  newSortOrder: number
  oldPath: string
  newPath: string
  pathChanged: boolean
  descendantCount: number
  descendants: { id: number; title: string; oldPath: string; newPath: string }[]
}

export type PlanError = {
  id: number | null
  message: string
}

export type PlanResult =
  | { ok: true; moves: PlannedMove[]; changedCount: number }
  | { ok: false; errors: PlanError[] }

/**
 * Compute the public URL path for a page
 * @returns '/a/b' for nested pages, '/' for homepage, null if not found or chain broken/cyclic
 */
export function pagePath(pages: TreePage[], id: number): string | null {
  const pageMap = new Map(pages.map(p => [p.id, p]))
  const page = pageMap.get(id)
  if (!page) return null

  // Build path from root to this page
  const path: string[] = []
  let current = page
  const visited = new Set<number>()

  while (current !== null) {
    if (visited.has(current.id)) return null // Cycle detected
    visited.add(current.id)

    if (current.isHomepage) {
      // Homepage is the root, reverse the path we built
      if (path.length === 0) return '/'
      return '/' + path.reverse().join('/')
    }

    path.push(current.slug)

    if (current.parent === null) {
      // Non-homepage page with no parent - orphan, treat as root
      return '/' + path.reverse().join('/')
    }

    current = pageMap.get(current.parent) ?? null
    if (current === null) return null // Parent not found
  }

  return null
}

/**
 * Build a tree from flat pages array
 * Children are sorted by sortOrder asc, then title (case-insensitive), then id
 * Orphans (missing parent) are treated as roots
 * Cycle-safe
 */
export function buildTree(pages: TreePage[]): TreeNode[] {
  const pageMap = new Map(pages.map(p => [p.id, p]))
  const childrenByParent = new Map<number | null, TreePage[]>()

  // Group pages by parent, treating orphans as roots
  for (const page of pages) {
    const parentExists = page.parent === null || pageMap.has(page.parent)
    const parent = parentExists ? page.parent : null

    if (!childrenByParent.has(parent)) {
      childrenByParent.set(parent, [])
    }
    childrenByParent.get(parent)!.push(page)
  }

  // Sort children by sortOrder, title, id
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      const titleCmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      if (titleCmp !== 0) return titleCmp
      return a.id - b.id
    })
  }

  // Recursively build tree
  const buildNode = (
    pageId: number | null,
    depth: number,
    visited: Set<number>
  ): TreeNode[] => {
    const children = childrenByParent.get(pageId) || []
    return children.map(page => {
      // Cycle safety: if we've seen this page before, return empty children
      if (visited.has(page.id)) {
        return {
          page,
          children: [],
          depth
        }
      }

      const newVisited = new Set(visited)
      newVisited.add(page.id)

      return {
        page,
        children: buildNode(page.id, depth + 1, newVisited),
        depth
      }
    })
  }

  // Find root pages (parent = null)
  const roots = childrenByParent.get(null) || []
  return roots.map(page => ({
    page,
    children: buildNode(page.id, 2, new Set([page.id])),
    depth: 1
  }))
}

/**
 * Plan moves for pages
 * Validates and returns all errors
 */
export function planMoves(pages: TreePage[], moves: MoveInput[]): PlanResult {
  const pageMap = new Map(pages.map(p => [p.id, p]))

  // Normalize moves: drop no-ops and de-duplicate by id (last wins)
  const movesByIdMap = new Map<number, MoveInput>()
  for (const move of moves) {
    const current = pageMap.get(move.id)
    if (!current) {
      movesByIdMap.set(move.id, move)
      continue
    }
    // Skip no-op: same parent AND same sortOrder
    if (current.parent === move.parent && current.sortOrder === move.sortOrder) {
      continue
    }
    movesByIdMap.set(move.id, move)
  }

  const effectiveMoves = Array.from(movesByIdMap.values()).filter(m =>
    pageMap.has(m.id)
  )

  // Build final state after applying moves
  const finalPages = pages.map(page => {
    const move = movesByIdMap.get(page.id)
    if (!move) return page
    return { ...page, parent: move.parent, sortOrder: move.sortOrder }
  })

  const finalPageMap = new Map(finalPages.map(p => [p.id, p]))

  // Collect all moved page IDs and their descendants
  const movedIds = new Set(effectiveMoves.map(m => m.id))
  const affectedIds = new Set(movedIds)

  for (const movedId of movedIds) {
    // Add all descendants of moved pages (cycle-safe)
    const addDescendants = (id: number, visited: Set<number>) => {
      if (visited.has(id)) return
      visited.add(id)

      for (const page of finalPages) {
        if (page.parent === id && !affectedIds.has(page.id)) {
          affectedIds.add(page.id)
          addDescendants(page.id, new Set(visited))
        }
      }
    }
    addDescendants(movedId, new Set())
  }

  // Validate final tree
  const errors: PlanError[] = []

  // Check for unknown page IDs in original moves (before normalization)
  for (const move of moves) {
    if (!pageMap.has(move.id)) {
      errors.push({ id: move.id, message: `Unknown page ID: ${move.id}` })
    }
  }

  // Check for unknown parent IDs in moves
  for (const move of effectiveMoves) {
    if (move.parent !== null && !finalPageMap.has(move.parent)) {
      errors.push({
        id: move.id,
        message: `Unknown parent ID: ${move.parent}`
      })
    }
  }

  // Check for cycles (page dropped into itself or descendant)
  for (const movedId of movedIds) {
    const move = movesByIdMap.get(movedId)!
    if (move.parent === movedId) {
      errors.push({
        id: movedId,
        message: `A page cannot be dropped into itself.`
      })
      continue
    }

    // Check if moving into a descendant
    const isDescendantOf = (ancestorId: number, descendantId: number): boolean => {
      let current: number | null = descendantId
      const visited = new Set<number>()
      while (current !== null) {
        if (visited.has(current)) return false
        visited.add(current)
        if (current === ancestorId) return true
        const page = finalPageMap.get(current)
        if (!page) return false
        current = page.parent
      }
      return false
    }

    if (move.parent !== null && isDescendantOf(movedId, move.parent)) {
      errors.push({
        id: movedId,
        message: `A page cannot be dropped into its own descendant.`
      })
    }
  }

  // Check depth limit
  const computeDepth = (id: number): number => {
    let depth = 1
    let current: number | null = id
    const visited = new Set<number>()
    while (current !== null) {
      if (visited.has(current)) return depth
      visited.add(current)
      const page = finalPageMap.get(current)
      if (!page) break
      if (page.parent === null) break
      current = page.parent
      depth++
    }
    return depth
  }

  const depthErrorIds = new Set<number>()
  for (const movedId of movedIds) {
    const depth = computeDepth(movedId)
    if (depth > MAX_DEPTH) {
      errors.push({
        id: movedId,
        message: `Page depth would exceed ${MAX_DEPTH} levels.`
      })
      depthErrorIds.add(movedId)
    }

    // Also check descendants for depth
    const checkDescendantDepth = (id: number, visited: Set<number>) => {
      if (visited.has(id)) return
      visited.add(id)

      for (const page of finalPages) {
        if (page.parent === id) {
          const d = computeDepth(page.id)
          if (d > MAX_DEPTH && !depthErrorIds.has(movedId)) {
            errors.push({
              id: movedId,
              message: `A descendant's depth would exceed ${MAX_DEPTH} levels.`
            })
            depthErrorIds.add(movedId)
            return
          }
          checkDescendantDepth(page.id, visited)
        }
      }
    }
    checkDescendantDepth(movedId, new Set())
  }

  // Check homepage constraint
  for (const movedId of movedIds) {
    const page = pageMap.get(movedId)!
    const move = movesByIdMap.get(movedId)
    if (page.isHomepage && move?.parent !== null) {
      errors.push({
        id: movedId,
        message: `The homepage must stay at the top level.`
      })
    }
  }

  // Check for slug clashes in final state (check all siblings of affected pages)
  const parentsByAffectedChild = new Set<number | null>()
  for (const id of affectedIds) {
    const page = finalPageMap.get(id)
    if (page) {
      parentsByAffectedChild.add(page.parent)
    }
  }

  for (const parentId of parentsByAffectedChild) {
    const siblingsMap = new Map<string, number[]>()
    for (const page of finalPages) {
      if (page.parent === parentId) {
        const slugLower = page.slug.toLowerCase()
        if (!siblingsMap.has(slugLower)) {
          siblingsMap.set(slugLower, [])
        }
        siblingsMap.get(slugLower)!.push(page.id)
      }
    }

    for (const [slug, ids] of siblingsMap) {
      if (ids.length > 1) {
        // Only report if at least one of the clashing pages is a moved page
        const hasMovedPage = ids.some(id => movedIds.has(id))
        if (hasMovedPage) {
          const clashingPages = ids.map(id => finalPageMap.get(id)!)
          const pageNames = clashingPages.map(p => p.title).join(' and ')
          const parentInfo = parentId === null ? 'the root' : `parent ${parentId}`
          errors.push({
            id: ids[0],
            message: `Slug clash under ${parentInfo}: ${pageNames} both use slug "${slug}".`
          })
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // Compute planned moves with paths
  const originalTree = buildTree(pages)
  const finalTree = buildTree(finalPages)

  const originalPathMap = new Map<number, string>()
  const finalPathMap = new Map<number, string>()

  // Compute all paths in original tree
  const computePathsInTree = (tree: TreeNode[], pathPrefix: string, pathMap: Map<number, string>) => {
    for (const node of tree) {
      if (node.page.isHomepage) {
        pathMap.set(node.page.id, '/')
      } else {
        pathMap.set(node.page.id, pathPrefix === '/' ? '/' + node.page.slug : pathPrefix + '/' + node.page.slug)
      }
      const newPrefix = pathMap.get(node.page.id)!
      computePathsInTree(node.children, newPrefix, pathMap)
    }
  }

  computePathsInTree(originalTree, '/', originalPathMap)
  computePathsInTree(finalTree, '/', finalPathMap)

  // Build descendants map for original state
  const originalDescendantsMap = new Map<number, number[]>()
  const collectDescendants = (pageId: number, pages: TreePage[]) => {
    const descendants: number[] = []
    const visited = new Set<number>()
    const collect = (id: number) => {
      if (visited.has(id)) return
      visited.add(id)
      for (const p of pages) {
        if (p.parent === id) {
          descendants.push(p.id)
          collect(p.id)
        }
      }
    }
    collect(pageId)
    return descendants
  }

  for (const move of effectiveMoves) {
    originalDescendantsMap.set(move.id, collectDescendants(move.id, pages))
  }

  // Build the result moves array in input order
  const resultMoves: PlannedMove[] = []
  const processedIds = new Set<number>()

  for (const move of effectiveMoves) {
    if (processedIds.has(move.id)) continue
    processedIds.add(move.id)

    const page = pageMap.get(move.id)!
    const oldPath = originalPathMap.get(move.id) ?? '/'
    const newPath = finalPathMap.get(move.id) ?? '/'
    const pathChanged = oldPath !== newPath

    const descendants = originalDescendantsMap.get(move.id)!.map(id => ({
      id,
      title: pageMap.get(id)?.title ?? '',
      oldPath: originalPathMap.get(id) ?? '/',
      newPath: finalPathMap.get(id) ?? '/'
    }))

    resultMoves.push({
      id: move.id,
      title: page.title,
      oldParent: page.parent,
      newParent: move.parent,
      oldSortOrder: page.sortOrder,
      newSortOrder: move.sortOrder,
      oldPath,
      newPath,
      pathChanged,
      descendantCount: descendants.length,
      descendants
    })
  }

  return {
    ok: true,
    moves: resultMoves,
    changedCount: effectiveMoves.length
  }
}
