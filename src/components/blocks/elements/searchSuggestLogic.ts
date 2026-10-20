/** Pure helpers for the live search combobox. No DOM, no React. */

export type SuggestItem = { title: string; url: string; type: string; excerpt: string }

/** Coerces an untrusted API payload into safe plain-text items (max `max`). Only same-site paths are kept. */
export function parseSuggestions(payload: unknown, max = 6): SuggestItem[] {
  const list = (payload as { results?: unknown } | null)?.results
  if (!Array.isArray(list)) return []
  const out: SuggestItem[] = []
  for (const r of list) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.slice(0, 200) : ''
    const url = typeof o.url === 'string' ? o.url : ''
    if (!title || !/^\/(?!\/)/.test(url)) continue
    out.push({ title, url, type: typeof o.type === 'string' ? o.type.slice(0, 30) : '', excerpt: typeof o.excerpt === 'string' ? o.excerpt.slice(0, 120) : '' })
    if (out.length >= max) break
  }
  return out
}

export type NavState = { open: boolean; active: number }
export type NavAction = { type: 'down' | 'up' | 'escape' | 'open' | 'home' | 'end' }

/** Keyboard state machine. active is -1 when no option is highlighted. */
export function navReduce(state: NavState, action: NavAction, count: number): NavState {
  switch (action.type) {
    case 'escape':
      return { open: false, active: -1 }
    case 'open':
      return { open: true, active: -1 }
    case 'down':
      if (count === 0) return state
      return { open: true, active: !state.open ? 0 : state.active + 1 >= count ? -1 : state.active + 1 }
    case 'up':
      if (count === 0) return state
      return { open: true, active: !state.open || state.active === -1 ? count - 1 : state.active - 1 }
    case 'home':
      return count ? { open: true, active: 0 } : state
    case 'end':
      return count ? { open: true, active: count - 1 } : state
  }
}

/** Where Enter should go: the highlighted option's url, or null to let the form submit to /search?q=. */
export function enterTarget(state: NavState, items: SuggestItem[]): string | null {
  return state.open && state.active >= 0 && state.active < items.length ? items[state.active].url : null
}
