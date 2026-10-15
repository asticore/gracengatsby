// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { buildThemeStylesCss } from '@/features/themeStyles/css'
import { sanitizeColourValue, sanitizeNumber, sanitizeSlug, sanitizeThemeStyles } from '@/features/themeStyles/sanitize'
import { loadThemeStyles, saveThemeStyles, type ThemeStylesD1 } from '@/features/themeStyles/store'
import { DEFAULT_THEME_STYLES, LIMITS, SYSTEM_COLOUR_IDS, SYSTEM_TYPE_IDS } from '@/features/themeStyles/types'
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
