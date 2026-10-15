/**
 * Theme styles sanitiser. Pure. Every value that can end up in generated CSS passes through here,
 * so nothing but known-safe tokens (colours, numbers, slugs, enum words) ever reaches a <style> block.
 * sanitizeThemeStyles never throws: any input, however hostile or broken, gives a valid ThemeStyles.
 */
import {
  DEFAULT_BUTTONS,
  DEFAULT_COLOURS,
  DEFAULT_TABLES,
  DEFAULT_TYPOGRAPHY,
  LIMITS,
  SYSTEM_BUTTON_IDS,
  SYSTEM_COLOUR_IDS,
  SYSTEM_TYPE_IDS,
  type ButtonStyle,
  type ShadowLevel,
  type TableAlign,
  type TableBorders,
  type TableStyle,
  type TextTransform,
  type ThemeColour,
  type ThemeStyles,
  type TypeStyle,
} from './types'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC = /^(?:rgb|rgba|hsl|hsla)\([0-9., %/]{1,60}\)$/i
const REF = /^@([a-z0-9-]{1,32})$/
const SLUG = /^[a-z0-9-]{1,32}$/
const FONT_ID = /^[a-z0-9-]{1,60}$/

/** A literal colour, `transparent` or an `@id` reference. Anything else gives ''. */
export function sanitizeColourValue(v: unknown): string {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  if (s.length === 0 || s.length > 80) return ''
  if (HEX.test(s)) return s.toLowerCase()
  if (FUNC.test(s)) return s.toLowerCase()
  if (s.toLowerCase() === 'transparent') return 'transparent'
  if (REF.test(s)) return s
  return ''
}

/** A literal colour only (no `@id` reference). */
function literalColour(v: unknown): string {
  const s = sanitizeColourValue(v)
  return s.startsWith('@') ? '' : s
}

/** Lower-case slug, [a-z0-9-], at most `max` characters. Returns '' when nothing usable is left. */
export function sanitizeSlug(v: unknown, max: number = 32): string {
  if (typeof v !== 'string') return ''
  const s = v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return s
}

export function sanitizeNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function cleanName(v: unknown, fallback: string): string {
  let s = ''
  if (typeof v === 'string') {
    for (const ch of v) {
      const code = ch.charCodeAt(0)
      s += code < 32 || code === 127 ? ' ' : ch
    }
    s = s.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name).trim()
  }
  return s || fallback
}

const TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const satisfies readonly TextTransform[]
const SHADOWS = ['none', 'soft', 'medium', 'strong'] as const satisfies readonly ShadowLevel[]
const BORDERS = ['all', 'rows', 'none'] as const satisfies readonly TableBorders[]
const ALIGNS = ['left', 'center', 'right'] as const satisfies readonly TableAlign[]
const RESPONSIVE = ['scroll', 'stack'] as const

/** Colour reference field: '' when invalid or pointing at a colour that does not exist. */
function ref(v: unknown, ids: ReadonlySet<string>, fallback: string): string {
  if (v === undefined || v === null) return fallback
  const s = sanitizeColourValue(v)
  if (s.startsWith('@') && !ids.has(s.slice(1))) return ''
  return s
}

function sanitizeColours(input: unknown): ThemeColour[] {
  const list = Array.isArray(input) ? input : []
  const byId = new Map<string, Record<string, unknown>>()
  const customOrder: string[] = []
  for (const raw of list) {
    const rec = asRecord(raw)
    const id = typeof rec.id === 'string' && SLUG.test(rec.id) ? rec.id : ''
    if (!id || byId.has(id)) continue
    byId.set(id, rec)
    if (!(SYSTEM_COLOUR_IDS as readonly string[]).includes(id)) customOrder.push(id)
  }
  const out: ThemeColour[] = []
  for (const def of DEFAULT_COLOURS) {
    const rec = byId.get(def.id)
    if (!rec) {
      out.push({ ...def })
      continue
    }
    out.push({
      id: def.id,
      name: cleanName(rec.name, def.name),
      value: literalColour(rec.value) || def.value,
      darkValue: literalColour(rec.darkValue),
      system: true,
    })
  }
  for (const id of customOrder) {
    if (out.length >= LIMITS.colours) break
    const rec = byId.get(id)!
    out.push({
      id,
      name: cleanName(rec.name, id),
      value: literalColour(rec.value) || '#000000',
      darkValue: literalColour(rec.darkValue),
      system: false,
    })
  }
  return out
}

function sanitizeType(rec: Record<string, unknown>, id: string, base: TypeStyle, colourIds: ReadonlySet<string>, system: boolean): TypeStyle {
  const fam = typeof rec.fontFamily === 'string' ? rec.fontFamily : undefined
  const fontFamily = fam === undefined ? base.fontFamily : fam === '' || fam === 'heading' || fam === 'body' || FONT_ID.test(fam) ? fam : base.fontFamily
  return {
    id,
    name: cleanName(rec.name, base.name),
    system,
    fontFamily,
    size: sanitizeNumber(rec.size, 8, 120, base.size),
    sizeTablet: sanitizeNumber(rec.sizeTablet, 0, 120, base.sizeTablet),
    sizeMobile: sanitizeNumber(rec.sizeMobile, 0, 120, base.sizeMobile),
    weight: Math.round(sanitizeNumber(rec.weight, 100, 900, base.weight) / 100) * 100,
    lineHeight: sanitizeNumber(rec.lineHeight, 0.8, 3, base.lineHeight),
    letterSpacing: sanitizeNumber(rec.letterSpacing, -5, 20, base.letterSpacing),
    transform: pick(rec.transform, TRANSFORMS, base.transform),
    colour: ref(rec.colour, colourIds, base.colour),
  }
}

function sanitizeTypography(input: unknown, colourIds: ReadonlySet<string>): TypeStyle[] {
  const list = Array.isArray(input) ? input : []
  const byId = new Map<string, Record<string, unknown>>()
  const customOrder: string[] = []
  for (const raw of list) {
    const rec = asRecord(raw)
    const id = typeof rec.id === 'string' && SLUG.test(rec.id) ? rec.id : ''
    if (!id || byId.has(id)) continue
    byId.set(id, rec)
    if (!(SYSTEM_TYPE_IDS as readonly string[]).includes(id)) customOrder.push(id)
  }
  const body = DEFAULT_TYPOGRAPHY.find((t) => t.id === 'body')!
  const out: TypeStyle[] = []
  for (const def of DEFAULT_TYPOGRAPHY) {
    const rec = byId.get(def.id)
    out.push(rec ? sanitizeType(rec, def.id, def, colourIds, true) : { ...def })
  }
  for (const id of customOrder) {
    if (out.length >= LIMITS.typography) break
    out.push(sanitizeType(byId.get(id)!, id, { ...body, system: false }, colourIds, false))
  }
  return out
}

function sanitizeButton(rec: Record<string, unknown>, id: string, base: ButtonStyle, colourIds: ReadonlySet<string>, system: boolean): ButtonStyle {
  const hover = asRecord(rec.hover)
  return {
    id,
    name: cleanName(rec.name, base.name),
    system,
    bg: ref(rec.bg, colourIds, base.bg),
    text: ref(rec.text, colourIds, base.text),
    borderColour: ref(rec.borderColour, colourIds, base.borderColour),
    borderWidth: sanitizeNumber(rec.borderWidth, 0, 8, base.borderWidth),
    radius: sanitizeNumber(rec.radius, 0, 999, base.radius),
    shadow: pick(rec.shadow, SHADOWS, base.shadow),
    paddingY: sanitizeNumber(rec.paddingY, 0, 80, base.paddingY),
    paddingX: sanitizeNumber(rec.paddingX, 0, 80, base.paddingX),
    fontSize: sanitizeNumber(rec.fontSize, 10, 40, base.fontSize),
    weight: Math.round(sanitizeNumber(rec.weight, 100, 900, base.weight) / 100) * 100,
    letterSpacing: sanitizeNumber(rec.letterSpacing, -5, 20, base.letterSpacing),
    transform: pick(rec.transform, TRANSFORMS, base.transform),
    transition: sanitizeNumber(rec.transition, 0, 1000, base.transition),
    hover: {
      bg: ref(hover.bg, colourIds, base.hover.bg),
      text: ref(hover.text, colourIds, base.hover.text),
      borderColour: ref(hover.borderColour, colourIds, base.hover.borderColour),
      lift: typeof hover.lift === 'boolean' ? hover.lift : base.hover.lift,
    },
  }
}

function sanitizeButtons(input: unknown, colourIds: ReadonlySet<string>): ButtonStyle[] {
  const list = Array.isArray(input) ? input : []
  const byId = new Map<string, Record<string, unknown>>()
  const customOrder: string[] = []
  for (const raw of list) {
    const rec = asRecord(raw)
    const id = typeof rec.id === 'string' && SLUG.test(rec.id) ? rec.id : ''
    if (!id || byId.has(id)) continue
    byId.set(id, rec)
    if (!(SYSTEM_BUTTON_IDS as readonly string[]).includes(id)) customOrder.push(id)
  }
  const out: ButtonStyle[] = []
  for (const def of DEFAULT_BUTTONS) {
    const rec = byId.get(def.id)
    out.push(rec ? sanitizeButton(rec, def.id, def, colourIds, true) : structuredClone(def))
  }
  const primary = DEFAULT_BUTTONS[0]
  for (const id of customOrder) {
    if (out.length >= LIMITS.buttons) break
    out.push(sanitizeButton(byId.get(id)!, id, { ...structuredClone(primary), system: false }, colourIds, false))
  }
  return out
}

function sanitizeTable(rec: Record<string, unknown>, id: string, base: TableStyle, colourIds: ReadonlySet<string>, system: boolean): TableStyle {
  return {
    id,
    name: cleanName(rec.name, base.name),
    system,
    headerBg: ref(rec.headerBg, colourIds, base.headerBg),
    headerText: ref(rec.headerText, colourIds, base.headerText),
    rowBg: ref(rec.rowBg, colourIds, base.rowBg),
    stripeBg: ref(rec.stripeBg, colourIds, base.stripeBg),
    hoverBg: ref(rec.hoverBg, colourIds, base.hoverBg),
    borderColour: ref(rec.borderColour, colourIds, base.borderColour),
    borders: pick(rec.borders, BORDERS, base.borders),
    borderWidth: sanitizeNumber(rec.borderWidth, 0, 8, base.borderWidth),
    cellPaddingY: sanitizeNumber(rec.cellPaddingY, 0, 40, base.cellPaddingY),
    cellPaddingX: sanitizeNumber(rec.cellPaddingX, 0, 40, base.cellPaddingX),
    align: pick(rec.align, ALIGNS, base.align),
    radius: sanitizeNumber(rec.radius, 0, 40, base.radius),
    captionColour: ref(rec.captionColour, colourIds, base.captionColour),
    fontSize: sanitizeNumber(rec.fontSize, 10, 24, base.fontSize),
    responsive: pick(rec.responsive, RESPONSIVE, base.responsive),
  }
}

function sanitizeTables(input: unknown, colourIds: ReadonlySet<string>): TableStyle[] {
  if (!Array.isArray(input)) return structuredClone(DEFAULT_TABLES)
  const byId = new Map<string, Record<string, unknown>>()
  const order: string[] = []
  for (const raw of input) {
    const rec = asRecord(raw)
    const id = typeof rec.id === 'string' && SLUG.test(rec.id) ? rec.id : ''
    if (!id || byId.has(id)) continue
    byId.set(id, rec)
    if (id !== 'default') order.push(id)
  }
  const base = DEFAULT_TABLES[0]
  const defRec = byId.get('default')
  const out: TableStyle[] = [defRec ? sanitizeTable(defRec, 'default', base, colourIds, true) : structuredClone(base)]
  for (const id of order) {
    if (out.length >= LIMITS.tables) break
    const known = DEFAULT_TABLES.find((t) => t.id === id)
    out.push(sanitizeTable(byId.get(id)!, id, { ...structuredClone(known ?? base), system: false }, colourIds, false))
  }
  return out
}

/** Rebuilds the whole document field by field. Never throws. */
export function sanitizeThemeStyles(input: unknown): ThemeStyles {
  try {
    const root = asRecord(input)
    const colours = sanitizeColours(root.colours)
    const colourIds = new Set(colours.map((c) => c.id))
    const tables = sanitizeTables(root.tables, colourIds)
    const wanted = typeof root.defaultTableId === 'string' ? root.defaultTableId : ''
    return {
      version: 1,
      colours,
      typography: sanitizeTypography(root.typography, colourIds),
      buttons: sanitizeButtons(root.buttons, colourIds),
      tables,
      defaultTableId: tables.some((t) => t.id === wanted) ? wanted : 'default',
    }
  } catch {
    return structuredClone({
      version: 1,
      colours: DEFAULT_COLOURS,
      typography: DEFAULT_TYPOGRAPHY,
      buttons: DEFAULT_BUTTONS,
      tables: DEFAULT_TABLES,
      defaultTableId: 'default',
    }) as ThemeStyles
  }
}
