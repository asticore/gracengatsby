/**
 * Pure list-editing helpers for the Theme styles screen. No React, no I/O, so
 * they run in the browser bundle and in the test runner alike.
 */
import {
  DEFAULT_BUTTONS,
  DEFAULT_COLOURS,
  DEFAULT_GLOBALS,
  DEFAULT_TABLES,
  DEFAULT_TYPOGRAPHY,
  LIMITS,
  type ButtonStyle,
  type TableStyle,
  type ThemeColour,
  type ThemeGlobals,
  type ThemePreset,
  type ThemePresetData,
  type ThemeStyles,
  type TypeStyle,
} from '@/features/themeStyles/types'

export type TabKey = 'colours' | 'typography' | 'buttons' | 'tables' | 'layout' | 'presets'

const SLUG_MAX = 32

/** Lower-case slug, [a-z0-9-], 1 to 32 characters. Falls back to `item`. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
  return slug || 'item'
}

/** A slug based on `name` that is not in `taken`; adds -2, -3 and so on. */
export function uniqueSlug(name: string, taken: readonly string[]): string {
  const base = slugify(name)
  if (!taken.includes(base)) return base
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`
    if (!taken.includes(candidate)) return candidate
  }
  return `${base.slice(0, SLUG_MAX - 4)}-${Date.now() % 1000}`
}

export function clampName(name: string): string {
  return name.slice(0, LIMITS.name)
}

// ---------- Colours ----------

export function addColour(colours: ThemeColour[], name = 'New colour', value = '#888888'): ThemeColour[] {
  if (colours.length >= LIMITS.colours) return colours
  const cleanName = clampName(name.trim() || 'New colour')
  const id = uniqueSlug(cleanName, colours.map((c) => c.id))
  return [...colours, { id, name: cleanName, value, darkValue: '', system: false }]
}

export function removeColour(colours: ThemeColour[], id: string): ThemeColour[] {
  return colours.filter((c) => !(c.id === id && !c.system))
}

/** Moves a custom colour up or down among the custom colours. System colours never move. */
export function moveColour(colours: ThemeColour[], id: string, direction: -1 | 1): ThemeColour[] {
  const index = colours.findIndex((c) => c.id === id)
  if (index < 0 || colours[index].system) return colours
  const target = index + direction
  if (target < 0 || target >= colours.length || colours[target].system) return colours
  const next = colours.slice()
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function updateColour(colours: ThemeColour[], id: string, patch: Partial<Pick<ThemeColour, 'name' | 'value' | 'darkValue'>>): ThemeColour[] {
  return colours.map((c) => (c.id === id ? { ...c, ...patch, name: patch.name !== undefined ? clampName(patch.name) : c.name } : c))
}

// ---------- Typography ----------

export function addTypeStyle(list: TypeStyle[], name = 'Custom text'): TypeStyle[] {
  if (list.length >= LIMITS.typography) return list
  const cleanName = clampName(name.trim() || 'Custom text')
  const id = uniqueSlug(cleanName, list.map((t) => t.id))
  const base = DEFAULT_TYPOGRAPHY.find((t) => t.id === 'body') as TypeStyle
  return [...list, { ...base, id, name: cleanName, system: false }]
}

export function removeTypeStyle(list: TypeStyle[], id: string): TypeStyle[] {
  return list.filter((t) => !(t.id === id && !t.system))
}

// ---------- Buttons ----------

export function addButton(list: ButtonStyle[], name: string): ButtonStyle[] {
  if (list.length >= LIMITS.buttons) return list
  const cleanName = clampName(name.trim() || 'Custom button')
  const id = uniqueSlug(cleanName, list.map((b) => b.id))
  const base = list.find((b) => b.id === 'primary') ?? DEFAULT_BUTTONS[0]
  return [...list, { ...base, hover: { ...base.hover }, id, name: cleanName, system: false }]
}

export function removeButton(list: ButtonStyle[], id: string): ButtonStyle[] {
  return list.filter((b) => !(b.id === id && !b.system))
}

// ---------- Tables ----------

export function addTable(list: TableStyle[], name = 'Custom table'): TableStyle[] {
  if (list.length >= LIMITS.tables) return list
  const cleanName = clampName(name.trim() || 'Custom table')
  const id = uniqueSlug(cleanName, list.map((t) => t.id))
  return [...list, { ...DEFAULT_TABLES[0], id, name: cleanName, system: false }]
}

export function duplicateTable(list: TableStyle[], id: string): TableStyle[] {
  if (list.length >= LIMITS.tables) return list
  const source = list.find((t) => t.id === id)
  if (!source) return list
  const name = clampName(`${source.name} copy`)
  return [...list, { ...source, id: uniqueSlug(name, list.map((t) => t.id)), name, system: false }]
}

/** Removes a custom table; the default id falls back to `default` when it was the one removed. */
export function removeTable(styles: ThemeStyles, id: string): ThemeStyles {
  const target = styles.tables.find((t) => t.id === id)
  if (!target || target.system) return styles
  const tables = styles.tables.filter((t) => t.id !== id)
  return { ...styles, tables, defaultTableId: styles.defaultTableId === id ? 'default' : styles.defaultTableId }
}

// ---------- Reset a tab ----------

export function resetTab(styles: ThemeStyles, tab: TabKey): ThemeStyles {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  switch (tab) {
    case 'colours':
      return { ...styles, colours: clone(DEFAULT_COLOURS) }
    case 'typography':
      return { ...styles, typography: clone(DEFAULT_TYPOGRAPHY) }
    case 'buttons':
      return { ...styles, buttons: clone(DEFAULT_BUTTONS) }
    case 'tables':
      return { ...styles, tables: clone(DEFAULT_TABLES), defaultTableId: 'default' }
    case 'layout':
      return { ...styles, globals: clone(DEFAULT_GLOBALS) }
    case 'presets':
      return styles
  }
}

// ---------- Globals (forms, links, images, containers, scales, breakpoints, custom CSS) ----------

/**
 * Returns a copy of `styles` with `globals` at `path` (for example `forms.fieldRadius` or
 * `customCss`) set to `value`. Only the objects along the path are copied. An unknown path
 * returns `styles` unchanged.
 */
export function setGlobal(styles: ThemeStyles, path: string, value: unknown): ThemeStyles {
  const keys = path.split('.').filter(Boolean)
  if (keys.length === 0) return styles
  const update = (node: unknown, index: number): unknown => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined
    const record = node as Record<string, unknown>
    const key = keys[index]
    if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined
    if (index === keys.length - 1) return { ...record, [key]: value }
    const child = update(record[key], index + 1)
    return child === undefined ? undefined : { ...record, [key]: child }
  }
  const globals = update(styles.globals, 0)
  return globals === undefined ? styles : { ...styles, globals: globals as ThemeGlobals }
}

/** Mobile must be below tablet. Returns an error message, or null when valid. */
export function validateBreakpoints(breakpoints: { tablet: number; mobile: number }): string | null {
  const { tablet, mobile } = breakpoints
  if (!Number.isFinite(tablet) || !Number.isFinite(mobile)) return 'Enter both breakpoints as numbers.'
  if (tablet < 600 || tablet > 1280) return 'Tablet must be between 600 and 1280 pixels.'
  if (mobile < 320 || mobile > 900) return 'Mobile must be between 320 and 900 pixels.'
  if (mobile >= tablet) return 'Mobile must be smaller than tablet.'
  return null
}

const SPACE_STEPS = [1, 2, 3, 4, 6, 8, 12, 16] as const

/** The resulting --eg-space-1..8 values (pixels) for a base unit. */
export function spaceScalePreview(base: number): Array<{ name: string; px: number }> {
  const unit = Number.isFinite(base) ? Math.min(16, Math.max(2, base)) : DEFAULT_GLOBALS.scales.spaceBase
  return SPACE_STEPS.map((multiple, index) => ({ name: `--eg-space-${index + 1}`, px: unit * multiple }))
}

// ---------- Presets ----------

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** A snapshot of the current design (everything except the presets list). */
export function snapshotData(styles: ThemeStyles): ThemePresetData {
  return cloneDeep({
    colours: styles.colours,
    typography: styles.typography,
    buttons: styles.buttons,
    tables: styles.tables,
    defaultTableId: styles.defaultTableId,
    globals: styles.globals,
  })
}

/** Saves the current design as a preset with a unique slug. No change for an empty name or at the limit. */
export function addPreset(styles: ThemeStyles, name: string): ThemeStyles {
  const presets = styles.presets ?? []
  const cleanName = clampName(name.trim())
  if (!cleanName || presets.length >= LIMITS.presets) return styles
  const id = uniqueSlug(cleanName, presets.map((p) => p.id))
  const preset: ThemePreset = { id, name: cleanName, data: snapshotData(styles) }
  return { ...styles, presets: [...presets, preset] }
}

export function renamePreset(styles: ThemeStyles, id: string, name: string): ThemeStyles {
  const cleanName = clampName(name.trim())
  if (!cleanName) return styles
  return { ...styles, presets: (styles.presets ?? []).map((p) => (p.id === id ? { ...p, name: cleanName } : p)) }
}

export function deletePreset(styles: ThemeStyles, id: string): ThemeStyles {
  return { ...styles, presets: (styles.presets ?? []).filter((p) => p.id !== id) }
}

/** Replaces the current design with a preset's data. The saved presets list is kept. */
export function applyPresetData(styles: ThemeStyles, data: ThemePresetData): ThemeStyles {
  const copy = cloneDeep(data)
  return {
    ...styles,
    colours: copy.colours,
    typography: copy.typography,
    buttons: copy.buttons,
    tables: copy.tables,
    defaultTableId: copy.defaultTableId,
    globals: copy.globals ?? cloneDeep(DEFAULT_GLOBALS),
  }
}

/** Fills missing groups and fields of an older document from DEFAULT_GLOBALS. */
export function fillGlobals(input: unknown): ThemeGlobals {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const out = cloneDeep(DEFAULT_GLOBALS) as unknown as Record<string, unknown>
  for (const key of Object.keys(out)) {
    const base = out[key]
    const given = source[key]
    if (base && typeof base === 'object') {
      if (given && typeof given === 'object' && !Array.isArray(given)) out[key] = { ...(base as object), ...(given as object) }
    } else if (typeof given === typeof base) {
      out[key] = given
    }
  }
  return out as unknown as ThemeGlobals
}

// ---------- Colour maths ----------

/** Parses #rgb or #rrggbb. Returns null for anything else. */
export function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

function channel(value: number): number {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

/** WCAG contrast ratio between two hex colours, 1 to 21. Null when either is not a hex colour. */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseHex(a)
  const second = parseHex(b)
  if (!first || !second) return null
  const la = luminance(first)
  const lb = luminance(second)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function meetsAA(ratio: number | null): boolean {
  return ratio !== null && ratio >= 4.5
}

/** Resolves '@id' references against the colour list (one level, light values). */
export function resolveColour(ref: string, colours: readonly ThemeColour[]): string {
  if (ref.startsWith('@')) return colours.find((c) => c.id === ref.slice(1))?.value ?? ''
  return ref
}

// ---------- Import ----------

export type ImportResult = { ok: true; styles: ThemeStyles } | { ok: false; error: string }

/** Client-side shape check for an imported file. The server sanitises again on save. */
export function parseImport(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'The file must contain a theme styles object.' }
  const obj = data as Record<string, unknown>
  if (obj.version !== 1) return { ok: false, error: 'Unsupported file: expected "version": 1.' }
  for (const key of ['colours', 'typography', 'buttons', 'tables'] as const) {
    if (!Array.isArray(obj[key])) return { ok: false, error: `The file is missing the "${key}" list.` }
  }
  if (typeof obj.defaultTableId !== 'string') return { ok: false, error: 'The file is missing "defaultTableId".' }
  const presets = Array.isArray(obj.presets) ? obj.presets : []
  return { ok: true, styles: { ...(obj as unknown as ThemeStyles), globals: fillGlobals(obj.globals), presets } }
}