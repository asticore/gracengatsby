/**
 * Starter presets for theme styles. Pure. Each is built from the defaults, so a new field added to the
 * defaults flows into every preset, and each one passes sanitizeThemeStyles unchanged.
 */
import {
  DEFAULT_BUTTONS,
  DEFAULT_COLOURS,
  DEFAULT_GLOBALS,
  DEFAULT_TABLES,
  DEFAULT_TYPOGRAPHY,
  type ButtonStyle,
  type ThemePreset,
  type ThemePresetData,
  type ThemeStyles,
} from './types'

function base(): ThemePresetData {
  return structuredClone({
    colours: DEFAULT_COLOURS,
    typography: DEFAULT_TYPOGRAPHY,
    buttons: DEFAULT_BUTTONS,
    tables: DEFAULT_TABLES,
    defaultTableId: 'default',
    globals: DEFAULT_GLOBALS,
  })
}

function setColours(data: ThemePresetData, values: Record<string, string>, dark: Record<string, string> = {}): void {
  for (const c of data.colours) {
    if (values[c.id]) c.value = values[c.id]
    if (c.id in dark) c.darkValue = dark[c.id]
  }
}

function setButtons(data: ThemePresetData, over: (b: ButtonStyle) => Partial<ButtonStyle>): void {
  data.buttons = data.buttons.map((b) => ({ ...b, ...over(b) }))
}

function setHeadings(data: ThemePresetData, fontFamily: string): void {
  for (const t of data.typography) if (/^h[1-6]$/.test(t.id)) t.fontFamily = fontFamily
}

function classic(): ThemePresetData {
  return base()
}

function modern(): ThemePresetData {
  const d = base()
  setColours(d, { primary: '#111827', text: '#111827', accent: '#2563eb', background: '#ffffff', surface: '#f3f4f6', border: '#e5e7eb' }, { primary: '#f9fafb', text: '#f9fafb', background: '#0f1115', surface: '#1a1d24', border: '#2d313c' })
  setHeadings(d, 'body')
  setButtons(d, () => ({ radius: 8 }))
  d.globals.forms.fieldRadius = 8
  return d
}

function warm(): ThemePresetData {
  const d = base()
  setColours(d, { primary: '#3b2a20', text: '#3b2a20', accent: '#b45309', background: '#fbf7f2', surface: '#ffffff', border: '#e8dccf' }, { primary: '#f5ece3', text: '#f5ece3', background: '#1c1612', surface: '#271f19', border: '#43362b' })
  setHeadings(d, 'heading')
  setButtons(d, () => ({ radius: 999 }))
  return d
}

function dark(): ThemePresetData {
  const d = base()
  setColours(d, { primary: '#f5f3f5', text: '#f5f3f5', accent: '#7c83ff', background: '#14151c', surface: '#1d1f29', border: '#34364a' }, { primary: '', text: '', background: '', surface: '', border: '' })
  setButtons(d, (b) =>
    b.id === 'secondary'
      ? { bg: 'transparent', text: '@text', borderColour: '@text', hover: { bg: '@accent', text: '@background', borderColour: '@accent', lift: false } }
      : { bg: '@accent', text: '@background', borderColour: '@accent', hover: { bg: '@text', text: '@background', borderColour: '@text', lift: false } },
  )
  return d
}

export const STARTER_PRESETS: ThemePreset[] = [
  { id: 'classic', name: 'Classic', data: classic() },
  { id: 'modern', name: 'Modern', data: modern() },
  { id: 'warm', name: 'Warm', data: warm() },
  { id: 'dark', name: 'Dark', data: dark() },
]

/** Replaces the design (colours, text, buttons, tables, globals) with a preset's snapshot. The saved presets list stays. */
export function applyPreset(styles: ThemeStyles, presetData: ThemePresetData): ThemeStyles {
  const d = structuredClone(presetData)
  return {
    version: 1,
    colours: d.colours,
    typography: d.typography,
    buttons: d.buttons,
    tables: d.tables,
    defaultTableId: d.defaultTableId,
    globals: d.globals,
    presets: styles.presets,
  }
}
