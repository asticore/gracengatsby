import { resolveValue } from './cascade'
import { cssNumber, lengthToCss, safeColor, safeFontFamily, safeLength, safeNumber, pickEnum } from './sanitize'
import { FONT_WEIGHTS, type Breakpoint, type StateName } from './types'

/**
 * A declaration whose value depends on device and state. The emitter asks for
 * the value at each breakpoint and state, then writes only what changes.
 */
export type Getter = (breakpoint: Breakpoint, state: StateName) => string | undefined
export type Leaf = { prop: string; get: Getter }

/** Formats one raw value for CSS, or returns undefined when it is unusable. */
export type Format = (value: unknown) => string | undefined

/** A leaf for a responsive, stated value: resolves the cascade, then formats it. */
export function leaf(prop: string, responsive: unknown, format: Format): Leaf {
  return {
    prop,
    get: (breakpoint, state) => {
      const value = resolveValue(responsive as Parameters<typeof resolveValue>[0], breakpoint, state)
      return value === undefined ? undefined : format(value)
    },
  }
}

/** Puts a leaf behind a condition (for example, only when the background type is "color"). */
export function gated(enabled: boolean, inner: Leaf): Leaf {
  return { prop: inner.prop, get: (bp, st) => (enabled ? inner.get(bp, st) : undefined) }
}

export const fmtLength: Format = (v) => lengthToCss(safeLength(v))
export const fmtColor: Format = (v) => safeColor(v)
export const fmtFont: Format = (v) => safeFontFamily(v)
export const fmtNumber = (min: number, max: number): Format => (v) => {
  const n = safeNumber(v, min, max)
  return n === undefined ? undefined : cssNumber(n)
}
export const fmtEnum = <T extends string>(allowed: readonly T[]): Format => (v) => pickEnum(v, allowed)

const FONT_WEIGHT_NUMBERS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** Font weight: a keyword, or a number from 100 to 900 in steps of 100. */
export const fmtFontWeight: Format = (v) => {
  if (typeof v === 'number' && FONT_WEIGHT_NUMBERS.includes(v)) return String(v)
  return pickEnum(v, FONT_WEIGHTS)
}
