import { UNITS, type Length, type Unit } from './types'

/**
 * Value sanitisers for the design model. Every value that reaches CSS passes
 * through here, so a bad or hostile stored value is dropped rather than
 * emitted. Nothing in this file throws.
 */

const MAX_STRING = 200
/** Characters that could close a rule, open a tag or start a new declaration. */
const FORBIDDEN = /[{};<>\\\u0000-\u001f\u007f]/
const DANGEROUS = /expression\s*\(|javascript:|vbscript:|@import|behavior\s*:|-moz-binding/i

/** Plain CSS string value (font names, gradient colours, etc). Returns undefined when unsafe. */
export function safeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_STRING) return undefined
  if (FORBIDDEN.test(trimmed) || DANGEROUS.test(trimmed)) return undefined
  return trimmed
}

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i
const FUNC_COLOR = /^(rgb|rgba|hsl|hsla)\(\s*[-0-9.,%\s/]+\)$/i
const WORD_COLOR = /^[a-z]{3,20}$/i

/** Hex, rgb(a), hsl(a) or a plain colour word (red, transparent, currentColor). */
export function safeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (HEX_COLOR.test(trimmed) || FUNC_COLOR.test(trimmed) || WORD_COLOR.test(trimmed)) return trimmed
  return undefined
}

/** Finite number inside [min, max]. Returns undefined otherwise. */
export function safeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < min || value > max) return undefined
  return value
}

/** Formats a number for CSS: at most 4 decimals, no exponent, no negative zero. */
export function cssNumber(value: number): string {
  return String(Number(value.toFixed(4)))
}

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value)
}

/** A Length with a finite number (or 'auto') and a whitelisted unit. */
export function safeLength(value: unknown): Length | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as { value?: unknown; unit?: unknown }
  if (!isUnit(v.unit)) return undefined
  if (v.value === 'auto') return { value: 'auto', unit: v.unit }
  const n = safeNumber(v.value, -10000, 10000)
  return n === undefined ? undefined : { value: n, unit: v.unit }
}

/** Length as a CSS value, e.g. "12px", "50%", "auto". */
export function lengthToCss(length: Length | undefined): string | undefined {
  if (!length) return undefined
  if (length.value === 'auto') return 'auto'
  return `${cssNumber(length.value)}${length.unit}`
}

/** Returns the value when it is one of the allowed keywords, else undefined. */
export function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

const URL_OK = /^(https?:\/\/|\/(?!\/))[^\s"'()\\<>{};]{1,2000}$/

/** http(s) or site-relative URL, safe to place inside url("..."). */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return URL_OK.test(trimmed) && !DANGEROUS.test(trimmed) ? trimmed : undefined
}

const FONT_NAME = /^[A-Za-z0-9 ,'"_-]{1,120}$/

/** Font family list such as "Inter, sans-serif". Letters, digits, spaces, commas and quotes only. */
export function safeFontFamily(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return FONT_NAME.test(trimmed) ? trimmed : undefined
}

const SCOPE_ID = /^[A-Za-z0-9_-]{1,64}$/
const CSS_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const CSS_CLASS = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/

/** Scope ids go inside [data-eid="..."], so only the safe alphabet is allowed. */
export function safeScopeId(value: unknown): string | undefined {
  return typeof value === 'string' && SCOPE_ID.test(value) ? value : undefined
}

export function safeCssId(value: unknown): string | undefined {
  return typeof value === 'string' && CSS_ID.test(value) ? value : undefined
}

/** Splits a class list and keeps only valid class names (max 20). */
export function safeClassList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\s+/) : []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && CSS_CLASS.test(item) && !out.includes(item)) out.push(item)
    if (out.length >= 20) break
  }
  return out
}
