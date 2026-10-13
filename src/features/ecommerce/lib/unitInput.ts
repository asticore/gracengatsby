/**
 * Pure helpers behind the unit-aware weight and size inputs on the product form
 * (`../admin/UnitInput.tsx`). Storage is always metric (kg, cm); these only convert
 * what is shown and typed, using the conversions in `./units.ts`.
 */

import { cmToDisplay, displayToCm, displayToKg, kgToDisplay, type UnitSystem } from './units'

export type UnitKind = 'weight' | 'dimension'

/** Stored canonical value (kg or cm) to the number shown in the chosen system. */
export function canonicalToDisplay(kind: UnitKind, canonical: number, system: UnitSystem): number {
  return kind === 'weight' ? kgToDisplay(canonical, system) : cmToDisplay(canonical, system)
}

/** A number typed in the chosen system back to canonical kg or cm. */
export function displayToCanonical(kind: UnitKind, typed: number, system: UnitSystem): number {
  return kind === 'weight' ? displayToKg(typed, system) : displayToCm(typed, system)
}

/**
 * Reads what was typed. Accepts plain decimals such as 2, 2.5 or .5 and a trailing dot while
 * typing ("2."). Blank or anything else (commas, signs, letters) gives undefined, so a typo can
 * never silently store a wrong weight.
 */
export function parseTyped(text: string): number | undefined {
  const cleaned = text.trim()
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/**
 * The text the box should show. While the user is typing, their own text is kept as long as it
 * still means the stored value (so "2." is not rewritten to "2" mid-keystroke). Otherwise the
 * stored canonical value is shown converted into the chosen system.
 */
export function shownText(kind: UnitKind, stored: number | undefined, system: UnitSystem, draft: string | null): string {
  if (draft !== null) {
    const typed = parseTyped(draft)
    if (typed === undefined && stored === undefined) return draft
    if (typed !== undefined && stored !== undefined && displayToCanonical(kind, typed, system) === stored) return draft
  }
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return ''
  return String(canonicalToDisplay(kind, stored, system))
}