/**
 * Build breadcrumb title for a page by walking its parent chain.
 * Handles cycles and missing parents gracefully, with max depth 8.
 */
export function breadcrumbTitle(
  page: { id?: number | string; title?: string; parent?: number | string | null } | undefined,
  byId?: Record<string | number, { title?: string; parent?: number | string | null } | undefined>,
): string {
  if (!page || !page.title) {
    return ''
  }

  const parts: string[] = []
  const visited = new Set<string | number>()
  const MAX_DEPTH = 8

  let current: typeof page | undefined = page
  for (let depth = 0; depth < MAX_DEPTH && current; depth++) {
    if (!current.title) break

    // Guard against cycles
    if (typeof current.id !== 'undefined') {
      const id = String(current.id)
      if (visited.has(id)) break
      visited.add(id)
    }

    parts.unshift(current.title)

    // Walk to parent
    if (!current.parent || !byId) break
    const parentId = current.parent
    const nextCurrent = byId[parentId] as typeof page | undefined
    if (!nextCurrent) break

    // Check if next would create a cycle before moving
    const nextId = (nextCurrent as { id?: number | string; title?: string; parent?: number | string | null }).id
    if (typeof nextId !== 'undefined' && visited.has(String(nextId))) {
      break
    }

    current = nextCurrent
  }

  return parts.join(' / ')
}
