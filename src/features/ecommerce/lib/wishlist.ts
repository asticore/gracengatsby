/**
 * Wishlist ("Save for later") helpers.
 *
 * A wishlist is an ordered list of product ids, oldest first, kept in the visitor's own browser
 * (localStorage). Nothing is stored on the server, so there is no migration and no account needed.
 * The pure functions here are shared by the client (heart button, list page) and by the public
 * endpoint that turns ids into product cards. Storage access is wrapped so a blocked or full
 * browser store degrades to an in-memory list instead of breaking the page.
 */

export const WISHLIST_KEY = 'eg-wishlist'
export const WISHLIST_EVENT = 'eg-wishlist-change'
export const WISHLIST_MAX = 100

/** Keeps positive, unique, whole ids in their original order, then keeps the newest WISHLIST_MAX. */
function normaliseIds(values: unknown[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out.slice(-WISHLIST_MAX)
}

/** Reads the stored JSON text. Anything that is not a JSON array of ids gives an empty list. */
export function parseWishlist(raw: unknown): number[] {
  if (typeof raw !== 'string' || raw.length === 0) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.isArray(data) ? normaliseIds(data) : []
}

/** The JSON text written back to storage. */
export function serialiseWishlist(ids: number[]): string {
  return JSON.stringify(normaliseIds(ids))
}

/** Adds the id when it is missing, removes it when it is there. Adding past the cap drops the oldest. */
export function toggleWishlist(ids: number[], id: number): number[] {
  const current = normaliseIds(ids)
  if (current.includes(id)) return current.filter((existing) => existing !== id)
  return normaliseIds([...current, id])
}

/** Whether the shop-settings wishlist toggle is on. A missing value counts as on, matching the default. */
export function wishlistEnabled(settings: unknown): boolean {
  const storefront = (settings as { storefront?: { wishlist?: unknown } } | null | undefined)?.storefront
  return storefront?.wishlist !== false
}

export type WishlistIdsCheck = { ok: true; ids: number[] } | { ok: false; error: string }

/** Validates the body of the public POST endpoint. Never trusts the browser: ids must be whole positive numbers. */
export function validateWishlistIds(input: unknown): WishlistIdsCheck {
  if (!Array.isArray(input)) return { ok: false, error: 'ids must be a list of product ids.' }
  if (input.length > WISHLIST_MAX) return { ok: false, error: `A wishlist can hold at most ${WISHLIST_MAX} items.` }
  if (!input.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, error: 'Each id must be a whole positive number.' }
  }
  return { ok: true, ids: normaliseIds(input) }
}

let memoryRaw = ''

/** The stored list as text, or '' when nothing is stored, the browser is not available, or storage is blocked. */
export function readWishlistRaw(): string {
  if (typeof window === 'undefined') return memoryRaw
  try {
    return window.localStorage.getItem(WISHLIST_KEY) ?? ''
  } catch {
    return memoryRaw
  }
}

/** Saves the list and tells every heart and list on the page to re-read it. */
export function writeWishlistIds(ids: number[]): void {
  if (typeof window === 'undefined') return
  const raw = serialiseWishlist(ids)
  memoryRaw = raw
  try {
    window.localStorage.setItem(WISHLIST_KEY, raw)
  } catch {
    // Storage is blocked or full: the in-memory copy still serves this page view.
  }
  window.dispatchEvent(new Event(WISHLIST_EVENT))
}
