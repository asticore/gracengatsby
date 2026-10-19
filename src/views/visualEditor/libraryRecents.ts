/** Recently used and favourite element types for the Elements library (localStorage, optional). */
export const RECENTS_KEY = 've-library-recents'
export const FAVS_KEY = 've-library-favs'
export const MAX_RECENTS = 6

export function pushRecent(list: readonly string[], slug: string, max = MAX_RECENTS): string[] {
  if (!slug) return [...list]
  return [slug, ...list.filter((s) => s !== slug)].slice(0, max)
}

export function toggleFavourite(list: readonly string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]
}

/** Parses a stored JSON string list, dropping junk and anything not in `known`. */
export function sanitiseList(raw: unknown, known?: ReadonlySet<string>): string[] {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  const out: string[] = []
  for (const v of data) if (typeof v === 'string' && !out.includes(v) && (!known || known.has(v))) out.push(v)
  return out
}

export function loadList(key: string, known?: ReadonlySet<string>): string[] {
  try {
    return sanitiseList(window.localStorage.getItem(key), known)
  } catch {
    return []
  }
}

export function saveList(key: string, list: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* storage unavailable: the lists just stay in memory */
  }
}
