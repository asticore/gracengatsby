// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { buildThemeStylesCss } from '@/features/themeStyles/css'
import { applyPreset, STARTER_PRESETS } from '@/features/themeStyles/presets'
import { sanitizeColourValue, sanitizeGlobals, sanitizeNumber, sanitizePresetData, sanitizeSlug, sanitizeThemeStyles } from '@/features/themeStyles/sanitize'
import { loadThemeStyles, saveThemeStyles, type ThemeStylesD1 } from '@/features/themeStyles/store'
import { DEFAULT_THEME_STYLES, LIMITS, SYSTEM_COLOUR_IDS, SYSTEM_TYPE_IDS } from '@/features/themeStyles/types'
import { RichText } from '@/localapi/richtext'
import type { InstalledFont } from '@/features/fonts/types'
import { buttonClassName } from '@/components/blocks/elements/ButtonElement'

const defaults = () => sanitizeThemeStyles(null)

describe('sanitizeColourValue', () => {
  it('accepts the allowed forms', () => {
    for (const ok of ['#fff', '#FFAA00', '#ffaa0080', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)', 'hsl(120 50% 50%)', 'hsla(120, 50%, 50%, 0.5)', 'transparent', '@primary']) {
      expect(sanitizeColourValue(ok), ok).not.toBe('')
    }
  })
  it('rejects hostile values', () => {
    for (const bad of ['red;}</style><script>', 'url(http://x)', 'expression(alert(1))', 'red', '#12', 'rgb(1,2,3);color:red', '@Bad Id', '@' + 'a'.repeat(33), 'javascript:1', 42, null, {}]) {
      expect(sanitizeColourValue(bad), String(bad)).toBe('')
    }
  })
  it('slug and number helpers', () => {
    expect(sanitizeSlug('  My Outline!! ')).toBe('my-outline')
    expect(sanitizeSlug('<script>')).toBe('script')
    expect(sanitizeSlug(5)).toBe('')
    expect(sanitizeNumber('abc', 1, 5, 3)).toBe(3)
    expect(sanitizeNumber(99, 1, 5, 3)).toBe(5)
    expect(sanitizeNumber(-9, 1, 5, 3)).toBe(1)
  })
})

describe('sanitizeThemeStyles', () => {
  it('turns any junk into the defaults', () => {
    for (const junk of ([null, undefined, 5, 'x', [], { colours: 'no' }] as unknown[])) {
      const s = sanitizeThemeStyles(junk)
      expect(s.colours.map((c) => c.id)).toEqual([...SYSTEM_COLOUR_IDS])
      expect(s.typography.map((t) => t.id)).toEqual([...SYSTEM_TYPE_IDS])
      expect(s.defaultTableId).toBe('default')
    }
    expect(defaults()).toEqual(DEFAULT_THEME_STYLES)
  })

  it('cleans hostile colour values and unicode names', () => {
    const s = sanitizeThemeStyles({
      colours: [{ id: 'primary', name: '  Brand\u0007‮  ', value: 'red;}</style><script>', darkValue: 'url(x)' }, { id: 'sky', name: 'Sky', value: 'expression(1)', darkValue: '' }],
      buttons: [{ id: 'primary', bg: 'url(javascript:1)', text: '@nope', borderColour: '@primary' }],
    })
    const primary = s.colours.find((c) => c.id === 'primary')!
    expect(primary.value).toBe('#1f2230')
    expect(primary.darkValue).toBe('')
    expect(primary.name).not.toContain('\u0007')
    expect(s.colours.find((c) => c.id === 'sky')!.value).toBe('#000000')
    const btn = s.buttons.find((b) => b.id === 'primary')!
    expect(btn.bg).toBe('')
    expect(btn.text).toBe('')
    expect(btn.borderColour).toBe('@primary')
  })

  it('clamps numbers, enums and over-limit arrays, trims names', () => {
    const manyColours = Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, name: 'x'.repeat(200), value: '#000' }))
    const manyButtons = Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, name: 'b' }))
    const s = sanitizeThemeStyles({
      colours: manyColours,
      buttons: [...manyButtons, { id: 'primary', radius: 5000, borderWidth: -3, fontSize: 'big', shadow: 'huge', transform: 'weird', transition: 99999 }],
      typography: [{ id: 'h1', size: 9999, weight: 450, lineHeight: 0, fontFamily: 'Bad Font;}', transform: 'x' }],
      tables: [{ id: 'default', borders: 'diagonal', responsive: 'fly', radius: 400 }],
    })
    expect(s.colours.length).toBe(LIMITS.colours)
    expect(s.colours.every((c) => c.name.length <= LIMITS.name)).toBe(true)
    expect(s.buttons.length).toBe(LIMITS.buttons)
    const primary = s.buttons.find((b) => b.id === 'primary')!
    expect(primary.radius).toBe(999)
    expect(primary.borderWidth).toBe(0)
    expect(primary.fontSize).toBe(DEFAULT_THEME_STYLES.buttons[0].fontSize)
    expect(primary.shadow).toBe('none')
    expect(primary.transform).toBe('uppercase')
    expect(primary.transition).toBe(1000)
    const h1 = s.typography.find((t) => t.id === 'h1')!
    expect(h1.size).toBe(120)
    expect(h1.lineHeight).toBe(0.8)
    expect(h1.weight % 100).toBe(0)
    expect(h1.fontFamily).toBe('heading')
    expect(h1.transform).toBe('none')
    const t = s.tables[0]
    expect(t.borders).toBe('rows')
    expect(t.responsive).toBe('scroll')
    expect(t.radius).toBe(40)
  })

  it('keeps system items, drops duplicates, never lets a custom item be system', () => {
    const s = sanitizeThemeStyles({
      colours: [{ id: 'sky', name: 'Sky', value: '#09f', system: true }, { id: 'sky', name: 'Dup', value: '#000' }, { id: 'accent', name: 'Mine', value: '#123456', system: false }],
      typography: [{ id: 'display', name: 'Display', system: true, size: 70 }],
      buttons: [{ id: 'outline', name: 'Outline', system: true }, { id: 'primary', name: 'P', system: false }],
      tables: [{ id: 'zebra', system: true }],
    })
    expect(s.colours.filter((c) => c.system).map((c) => c.id)).toEqual([...SYSTEM_COLOUR_IDS])
    expect(s.colours.filter((c) => c.id === 'sky')).toHaveLength(1)
    expect(s.colours.find((c) => c.id === 'sky')).toMatchObject({ name: 'Sky', system: false })
    expect(s.colours.find((c) => c.id === 'accent')).toMatchObject({ value: '#123456', system: true })
    expect(s.typography.find((t) => t.id === 'display')!.system).toBe(false)
    expect(s.typography.filter((t) => t.system)).toHaveLength(SYSTEM_TYPE_IDS.length)
    expect(s.buttons.find((b) => b.id === 'outline')!.system).toBe(false)
    expect(s.buttons.find((b) => b.id === 'primary')!.system).toBe(true)
    expect(s.buttons.find((b) => b.id === 'secondary')!.system).toBe(true)
    expect(s.tables[0]).toMatchObject({ id: 'default', system: true })
    expect(s.tables.find((t) => t.id === 'zebra')!.system).toBe(false)
  })

  it('turns refs to missing colours into empty and resets a bad defaultTableId', () => {
    const s = sanitizeThemeStyles({
      typography: [{ id: 'h2', colour: '@ghost' }, { id: 'h3', colour: '@accent' }],
      tables: [{ id: 'default', headerBg: '@ghost', rowBg: '@surface' }, { id: 'zebra' }],
      defaultTableId: 'nope',
    })
    expect(s.typography.find((t) => t.id === 'h2')!.colour).toBe('')
    expect(s.typography.find((t) => t.id === 'h3')!.colour).toBe('@accent')
    expect(s.tables[0].headerBg).toBe('')
    expect(s.tables[0].rowBg).toBe('@surface')
    expect(s.defaultTableId).toBe('default')
    expect(sanitizeThemeStyles({ tables: [{ id: 'default' }, { id: 'zebra' }], defaultTableId: 'zebra' }).defaultTableId).toBe('zebra')
  })
})

describe('buildThemeStylesCss', () => {
  const legacy = { primaryColor: '#112233', accentColor: '#aabbcc', backgroundColor: '#fafafa' }

  it('defaults define the colour variables and never contain <', () => {
    const css = buildThemeStylesCss(defaults(), { saved: false })
    expect(css).toContain('--eg-c-primary:#1f2230')
    expect(css).toContain('[data-theme="dark"]{')
    expect(css).not.toContain('<')
  })

  it('stays safe with hostile input', () => {
    const hostile = {
      colours: [{ id: 'x</style><script>', name: '<b>', value: 'red;}</style><script>alert(1)</script>' }, { id: 'ok', value: '#fff' }],
      buttons: [{ id: 'evil</style>', name: '</style>', bg: '</style><script>' }],
    }
    for (const saved of [false, true]) {
      const css = buildThemeStylesCss(hostile, { saved, legacy: { primaryColor: '</style><script>' } })
      expect(css).not.toContain('<')
      expect(css.toLowerCase()).not.toContain('script')
    }
  })

  it('saved:false uses legacy colours and leaves the old variables alone', () => {
    const css = buildThemeStylesCss(defaults(), { saved: false, legacy })
    expect(css).toContain('--eg-c-primary:#112233')
    expect(css).toContain('--eg-c-accent:#aabbcc')
    expect(css).toContain('--eg-c-background:#fafafa')
    expect(css).not.toContain('--color-ink:var(--eg-c-primary)')
    expect(css).not.toContain('html .btn.btn--primary')
    expect(css).not.toContain(':where(h1)')
    expect(css).not.toContain('.account-table')
    expect(css).toContain('.eg-type-h1')
  })

  it('saved:true overrides the old variables and styles elements', () => {
    const css = buildThemeStylesCss(defaults(), { saved: true, legacy })
    expect(css).toContain('--color-ink:var(--eg-c-primary)')
    expect(css).toContain('--color-line:var(--eg-c-border)')
    expect(css).toContain('--eg-c-primary:#1f2230')
    expect(css).not.toContain('--eg-c-primary:#112233')
    expect(css).toContain('html .btn.btn--primary')
    expect(css).toContain('html .btn.btn--secondary')
    expect(css).toContain(':where(h1)')
    expect(css).toContain(':where(a:not(.btn))')
  })

  it('emits custom button ids even when not saved, with states and modifiers', () => {
    const styles = sanitizeThemeStyles({
      buttons: [{ id: 'outline', name: 'Outline', bg: 'transparent', text: '@primary', borderColour: '@primary', shadow: 'medium', transition: 300, hover: { bg: '@primary', text: '@background', borderColour: '@primary', lift: true } }],
    })
    const css = buildThemeStylesCss(styles, { saved: false })
    expect(css).toContain('.btn--outline')
    expect(css).toContain('.btn.btn--outline:hover')
    expect(css).toContain('.btn.btn--outline:focus-visible')
    expect(css).toContain('box-shadow:0 6px 18px rgba(0,0,0,.18)')
    expect(css).toContain('transition:all 300ms ease')
    expect(css).toContain('translateY(-2px)')
    expect(css).toContain('.btn--outline.btn--sm')
    expect(css).toContain('.btn--outline.btn--lg')
    expect(css).toContain('.btn--block')
    expect(css).toContain('var(--eg-c-primary)')
  })

  it('lists the default table selectors and the responsive rules', () => {
    const css = buildThemeStylesCss(defaults(), { saved: true })
    expect(css).toContain('table.eg-table,.account-table,.rich-text table,.dv-table')
    expect(css).not.toContain('shop-reports__table')
    expect(css).toContain('.eg-table--striped')
    expect(css).toContain('.eg-table-wrap{overflow-x:auto}')
    expect(css).toContain('@media (max-width: 1024px)')
    expect(css).toContain('@media (max-width: 640px)')
    const stacked = buildThemeStylesCss({ tables: [{ id: 'default', responsive: 'stack' }] }, { saved: true })
    expect(stacked).toContain('content:attr(data-label)')
  })

  it('uses the chosen default table for the global selectors', () => {
    const css = buildThemeStylesCss({ tables: [{ id: 'default' }, { id: 'zebra', stripeBg: '#eeeeee', radius: 12 }], defaultTableId: 'zebra' }, { saved: true })
    const firstGlobal = css.indexOf('table.eg-table,.account-table')
    expect(css.slice(firstGlobal, firstGlobal + 400)).toContain('border-radius:12px')
  })
})

/** A tiny fake of the bits of D1 the store uses. */
function fakeD1(opts: { tableExists?: boolean; row?: string | null } = {}): ThemeStylesD1 & { rows: Map<number, { data: string; updated_at: string }> } {
  const rows = new Map<number, { data: string; updated_at: string }>()
  if (opts.row !== undefined && opts.row !== null) rows.set(1, { data: opts.row, updated_at: 'x' })
  let exists = opts.tableExists !== false
  return {
    rows,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          all: async <T,>() => {
            if (!exists) throw new Error('no such table: eg_theme_styles')
            const row = rows.get(1)
            return { results: (row ? [{ data: row.data }] : []) as T[] }
          },
          run: async () => {
            if (sql.startsWith('CREATE TABLE')) exists = true
            else if (sql.startsWith('INSERT')) rows.set(1, { data: String(args[0]), updated_at: String(args[1]) })
            return {}
          },
        }),
      }
    },
  }
}

describe('theme styles store', () => {
  it('missing table or row gives the defaults, not saved', async () => {
    for (const d1 of [fakeD1({ tableExists: false }), fakeD1()]) {
      const r = await loadThemeStyles(d1)
      expect(r.saved).toBe(false)
      expect(r.styles).toEqual(DEFAULT_THEME_STYLES)
    }
  })
  it('bad JSON gives the defaults', async () => {
    const r = await loadThemeStyles(fakeD1({ row: '{not json' }))
    expect(r).toEqual({ styles: DEFAULT_THEME_STYLES, saved: false })
  })
  it('a throwing database never throws', async () => {
    const boom = { prepare: () => { throw new Error('down') } } as unknown as ThemeStylesD1
    expect((await loadThemeStyles(boom)).saved).toBe(false)
  })
  it('saves sanitised data and loads it back', async () => {
    const d1 = fakeD1({ tableExists: false })
    const saved = await saveThemeStyles({ colours: [{ id: 'primary', value: '#abcdef' }, { id: 'evil', value: 'red;}' }], defaultTableId: 'nope' }, d1)
    expect(saved.colours.find((c) => c.id === 'primary')!.value).toBe('#abcdef')
    expect(d1.rows.get(1)!.updated_at).toMatch(/^\d{4}-\d\d-\d\dT/)
    const loaded = await loadThemeStyles(d1)
    expect(loaded.saved).toBe(true)
    expect(loaded.styles).toEqual(saved)
    expect(loaded.styles.colours.find((c) => c.id === 'evil')!.value).toBe('#000000')
  })
})

describe('ButtonElement classes', () => {
  it('maps variant, style name and size', () => {
    expect(buttonClassName('primary')).toBe('btn btn--primary')
    expect(buttonClassName(undefined)).toBe('btn btn--primary')
    expect(buttonClassName('secondary')).toBe('btn btn--secondary')
    expect(buttonClassName('plain')).toBe('btn btn--ghost')
    expect(buttonClassName('primary', 'Outline')).toBe('btn btn--primary btn--outline')
    expect(buttonClassName('secondary', '"><x')).toBe('btn btn--secondary btn--x')
    expect(buttonClassName('secondary', '!!!')).toBe('btn btn--secondary')
    expect(buttonClassName('primary', '', 'sm')).toBe('btn btn--primary btn--sm')
    expect(buttonClassName('primary', undefined, 'lg')).toBe('btn btn--primary btn--lg')
    expect(buttonClassName('primary', undefined, 'md')).toBe('btn btn--primary')
  })
})

describe('theme styles part 2: globals and presets', () => {
  it('an old row without globals or presets loads with defaults', () => {
    const old: Record<string, unknown> = { version: 1, colours: [], typography: [], buttons: [], tables: [], defaultTableId: 'default' }
    const s = sanitizeThemeStyles(old)
    expect(s.globals).toEqual(DEFAULT_THEME_STYLES.globals)
    expect(s.presets).toEqual([])
    expect(sanitizeThemeStyles(s)).toEqual(s)
  })

  it('strips hostile custom css', () => {
    const evil = 'a{b:c}</style><script>x</script> @IMPORT url(x); b{background:url(JavaScript:1)} c{width:ExPression(1)} d{behavior:url(x);-MOZ-binding:x} @@importimport'
    const out = sanitizeGlobals({ customCss: evil }).customCss
    expect(out).not.toContain('<')
    for (const bad of ['</', '@import', 'expression(', 'javascript:', 'behavior:', '-moz-binding']) expect(out.toLowerCase()).not.toContain(bad)
    expect(sanitizeGlobals({ customCss: 'x'.repeat(LIMITS.customCss + 500) }).customCss.length).toBe(LIMITS.customCss)
    expect(sanitizeGlobals({ customCss: 5 }).customCss).toBe('')
  })

  it('keeps breakpoint invariants', () => {
    const bp = (v: unknown) => sanitizeGlobals({ breakpoints: v }).breakpoints
    expect(bp({ tablet: 900, mobile: 500 })).toEqual({ tablet: 900, mobile: 500 })
    expect(bp({ tablet: 100, mobile: 5000 })).toEqual({ tablet: 600, mobile: 599 })
    expect(bp({ tablet: 700, mobile: 700 })).toEqual({ tablet: 700, mobile: 699 })
    expect(bp({ tablet: 9999, mobile: 100 })).toEqual({ tablet: 1280, mobile: 320 })
    expect(bp('junk')).toEqual({ tablet: 1024, mobile: 640 })
    const b = bp({ tablet: 610, mobile: 890 })
    expect(b.mobile).toBeLessThan(b.tablet)
  })

  it('clamps globals and falls back on bad enums and colours', () => {
    const g = sanitizeGlobals({
      forms: { fieldRadius: 999, fieldBg: 'red;}', focusBorder: '@nope', labelWeight: 450 },
      links: { underline: 'sometimes' },
      images: { shadow: 'huge', radius: -4 },
      containers: { maxWidth: 10 },
      scales: { spaceBase: 99 },
    })
    expect(g.forms.fieldRadius).toBe(40)
    expect(g.forms.fieldBg).toBe('')
    expect(g.forms.focusBorder).toBe('')
    expect(g.forms.labelWeight).toBe(500)
    expect(g.links.underline).toBe('hover')
    expect(g.images.shadow).toBe('none')
    expect(g.images.radius).toBe(0)
    expect(g.containers.maxWidth).toBe(640)
    expect(g.scales.spaceBase).toBe(16)
  })

  it('limits presets, uniques ids, trims names and ignores nested presets', () => {
    const many = Array.from({ length: LIMITS.presets + 5 }, (_, i) => ({ id: `p${i}`, name: `  P ${i}  `, data: {} }))
    const s = sanitizeThemeStyles({ presets: many })
    expect(s.presets).toHaveLength(LIMITS.presets)
    expect(s.presets[0].name).toBe('P 0')
    const dup = sanitizeThemeStyles({ presets: [{ id: 'A b', name: 'x', data: {} }, { id: 'a-b', name: 'y', data: {} }, { id: '', name: 'z' }] })
    expect(dup.presets.map((p) => p.id)).toEqual(['a-b'])
    const nested = sanitizeThemeStyles({ presets: [{ id: 'n', name: 'n', data: { presets: [{ id: 'q' }], colours: [] } }] })
    expect('presets' in nested.presets[0].data).toBe(false)
    expect(sanitizePresetData({ presets: [1] })).not.toHaveProperty('presets')
  })

  it('emits scale variables always, other globals only when saved', () => {
    const s = sanitizeThemeStyles(null)
    const off = buildThemeStylesCss(s, { saved: false })
    const on = buildThemeStylesCss(s, { saved: true })
    expect(off).toContain('--eg-space-3:12px')
    expect(off).toContain('--eg-space-8:64px')
    expect(off).toContain('--eg-radius-md:10px')
    expect(off).toContain('--eg-shadow-sm:0 2px 8px')
    expect(off).not.toContain('--max-width')
    expect(off).not.toContain('color-mix')
    expect(off).not.toContain('--eg-gap')
    expect(on).toContain('--max-width:1180px')
    expect(on).toContain('--eg-gap:24px')
    expect(on).toContain('--eg-section-pad:80px')
    expect(on).toContain('color-mix(in srgb, var(--eg-c-accent) 25%, transparent)')
    expect(on).toContain('::placeholder')
    expect(on).toContain(':where(a:not(.btn):hover)')
    expect(on).toContain('.built-block img')
    expect(on).toContain('header img')
  })

  it('uses the custom breakpoints in every media query', () => {
    const s = sanitizeThemeStyles({ globals: { breakpoints: { tablet: 900, mobile: 500 } }, tables: [{ id: 'default', responsive: 'stack' }] })
    const css = buildThemeStylesCss(s, { saved: true })
    expect(css).toContain('@media (max-width: 900px)')
    expect(css).toContain('@media (max-width: 500px)')
    expect(css).not.toContain('1024px')
    expect(css).not.toContain('640px')
  })

  it('appends sanitised custom css last and stays free of <', () => {
    const css = buildThemeStylesCss({ globals: { customCss: '.x{color:red}</style><script>@import "a";' } }, { saved: true })
    expect(css.indexOf('.x{color:red}')).toBeGreaterThan(css.indexOf('--eg-space-1'))
    expect(css.toLowerCase()).not.toContain('@import')
    expect(css.trim().endsWith('"a";')).toBe(true)
    expect(css).not.toContain('<')
    expect(buildThemeStylesCss({ globals: { customCss: '.x{color:red}' } }, { saved: false })).not.toContain('.x{color:red}')
  })

  it('has no < with hostile values everywhere', () => {
    const h = '</style><script>alert(1)</script>'
    const hostile = {
      colours: [{ id: 'primary', value: h }],
      typography: [{ id: 'h1', fontFamily: h, colour: h }],
      globals: {
        forms: Object.fromEntries(['fieldBg', 'fieldText', 'fieldBorder', 'focusBorder', 'labelColour', 'placeholderColour', 'errorColour'].map((k) => [k, h])),
        links: { hoverColour: h, underline: h },
        images: { borderColour: h, shadow: h },
        containers: { maxWidth: h },
        breakpoints: { tablet: h, mobile: h },
        customCss: h,
      },
      presets: [{ id: 'x', name: h, data: { globals: { customCss: h } } }],
    }
    const fonts = [{ id: 'f', family: 'Evil', source: 'upload', weights: [400], italic: false, local: false, files: {} }] as InstalledFont[]
    for (const saved of [false, true]) expect(buildThemeStylesCss(hostile, { saved }, { fonts })).not.toContain('<')
  })

  it('resolves an installed font id in typography, else the body font', () => {
    const fonts: InstalledFont[] = [{ id: 'my-font', family: 'My Font', source: 'upload', category: 'serif', weights: [400], italic: false, local: false, files: {} }]
    const input = { typography: [{ id: 'h1', fontFamily: 'my-font' }, { id: 'h2', fontFamily: 'gone-font' }] }
    const withFonts = buildThemeStylesCss(input, { saved: true }, { fonts })
    expect(withFonts).toContain(':where(h1){font-family:"My Font", Georgia, serif;')
    expect(withFonts).toContain(':where(h2){font-family:var(--font-body);')
    expect(buildThemeStylesCss(input, { saved: true })).toContain(':where(h1){font-family:var(--font-body);')
  })

  it('starter presets are stable under sanitize and classic equals the defaults', () => {
    expect(STARTER_PRESETS.map((p) => p.id)).toEqual(['classic', 'modern', 'warm', 'dark'])
    for (const p of STARTER_PRESETS) {
      const doc = applyPreset(DEFAULT_THEME_STYLES, p.data)
      expect(sanitizeThemeStyles(doc), p.id).toEqual(doc)
      expect(sanitizePresetData(p.data), p.id).toEqual(p.data)
    }
    expect(STARTER_PRESETS[0].data).toEqual({ ...sanitizePresetData(null) })
    const modern = STARTER_PRESETS[1].data
    expect(modern.colours.find((c) => c.id === 'accent')!.value).toBe('#2563eb')
    expect(modern.typography.find((t) => t.id === 'h1')!.fontFamily).toBe('body')
    expect(STARTER_PRESETS[2].data.buttons[0].radius).toBe(999)
    expect(STARTER_PRESETS[3].data.colours.find((c) => c.id === 'background')!.value).toBe('#14151c')
  })

  it('applyPreset replaces the design and keeps the presets list', () => {
    const current = sanitizeThemeStyles({ presets: [{ id: 'mine', name: 'Mine', data: {} }], globals: { customCss: '.a{}' } })
    const next = applyPreset(current, STARTER_PRESETS[1].data)
    expect(next.presets).toEqual(current.presets)
    expect(next.globals.customCss).toBe('')
    expect(next.colours.find((c) => c.id === 'primary')!.value).toBe('#111827')
    expect(next.buttons[0]).not.toBe(STARTER_PRESETS[1].data.buttons[0])
  })

  it('rich-text tables carry eg-table and no inline border or padding', () => {
    const cell = (header: number) => ({ type: 'tablecell', headerState: header, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', text: 'x', version: 1 }] }] })
    const data = { root: { type: 'root', version: 1, children: [{ type: 'table', version: 1, children: [{ type: 'tablerow', version: 1, children: [cell(1), cell(0)] }] }] } }
    const html = renderToStaticMarkup(createElement(RichText, { data } as never))
    expect(html).toContain('eg-table')
    expect(html).toContain('<th')
    expect(html).toContain('<td')
    expect(html).not.toMatch(/border/)
    expect(html).not.toMatch(/padding/)
  })
})
