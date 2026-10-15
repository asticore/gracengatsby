/**
 * Builds the global stylesheet from the theme styles. Pure.
 * The input is re-sanitised first and every value is emitted only as a validated colour, a number,
 * an enum word or a slug id, so no user text can break out of the <style> block.
 */
import { fontStack } from '@/features/fonts/installed'
import type { InstalledFont } from '@/features/fonts/types'

import { sanitizeColourValue, sanitizeCustomCss, sanitizeThemeStyles } from './sanitize'
import type { BreakpointGlobals, ButtonStyle, ShadowLevel, TableStyle, ThemeGlobals, TypeStyle } from './types'

type FontMap = ReadonlyMap<string, string>

export type ThemeStylesCssOptions = {
  /** True when a row exists in eg_theme_styles. False keeps the site looking exactly as before. */
  saved: boolean
  legacy?: { primaryColor?: string; accentColor?: string; backgroundColor?: string }
}

const SHADOWS: Record<ShadowLevel, string> = {
  none: 'none',
  soft: '0 2px 8px rgba(0,0,0,.12)',
  medium: '0 6px 18px rgba(0,0,0,.18)',
  strong: '0 12px 32px rgba(0,0,0,.26)',
}

/** A colour value as CSS: '@id' becomes var(--eg-c-id), '' stays ''. */
function col(v: string): string {
  const s = sanitizeColourValue(v)
  return s.startsWith('@') ? `var(--eg-c-${s.slice(1)})` : s
}

function decl(prop: string, value: string | number): string {
  return value === '' ? '' : `${prop}:${value};`
}

function px(n: number): string {
  return `${n}px`
}

function typeDecls(t: TypeStyle, kind: 'full' | 'link', fonts: FontMap): string {
  const installed = fonts.get(t.fontFamily)
  const family = installed ?? (t.fontFamily === 'heading' ? 'var(--font-display)' : t.fontFamily === '' ? '' : 'var(--font-body)')
  if (kind === 'link') {
    return [
      t.fontFamily === 'heading' || installed ? decl('font-family', family) : '',
      t.weight !== 400 ? decl('font-weight', t.weight) : '',
      t.letterSpacing !== 0 ? decl('letter-spacing', px(t.letterSpacing)) : '',
      t.transform !== 'none' ? decl('text-transform', t.transform) : '',
      decl('color', col(t.colour)),
    ].join('')
  }
  return [
    decl('font-family', family),
    decl('font-size', px(t.size)),
    decl('font-weight', t.weight),
    decl('line-height', t.lineHeight),
    decl('letter-spacing', px(t.letterSpacing)),
    decl('text-transform', t.transform),
    decl('color', col(t.colour)),
  ].join('')
}

function typeRules(selector: string, t: TypeStyle, kind: 'full' | 'link', fonts: FontMap): { base: string; tablet: string; mobile: string } {
  const base = `${selector}{${typeDecls(t, kind, fonts)}}`
  const size = (n: number) => (kind === 'link' || n <= 0 ? '' : `${selector}{font-size:${px(n)}}`)
  return { base, tablet: size(t.sizeTablet), mobile: size(t.sizeMobile) }
}

const TYPE_ELEMENTS: Record<string, string> = {
  h1: ':where(h1)',
  h2: ':where(h2)',
  h3: ':where(h3)',
  h4: ':where(h4)',
  h5: ':where(h5)',
  h6: ':where(h6)',
  body: ':where(body)',
  small: ':where(small)',
  caption: ':where(caption)',
  link: ':where(a:not(.btn))',
}

function buildTypography(typography: TypeStyle[], saved: boolean, fonts: FontMap, bp: BreakpointGlobals): string {
  const base: string[] = []
  const tablet: string[] = []
  const mobile: string[] = []
  const push = (r: { base: string; tablet: string; mobile: string }) => {
    base.push(r.base)
    if (r.tablet) tablet.push(r.tablet)
    if (r.mobile) mobile.push(r.mobile)
  }
  if (saved) {
    for (const t of typography) {
      const sel = t.system ? TYPE_ELEMENTS[t.id] : undefined
      if (sel) push(typeRules(sel, t, t.id === 'link' ? 'link' : 'full', fonts))
    }
  }
  for (const t of typography) push(typeRules(`.eg-type-${t.id}`, t, 'full', fonts))
  const out = [...base]
  if (tablet.length) out.push(`@media (max-width: ${bp.tablet}px){${tablet.join('')}}`)
  if (mobile.length) out.push(`@media (max-width: ${bp.mobile}px){${mobile.join('')}}`)
  return out.join('\n')
}

function buildButton(b: ButtonStyle, saved: boolean): string {
  const system = b.system
  if (system && !saved) return ''
  const pre = system ? 'html ' : ''
  const sel = system ? [`${pre}.btn.btn--${b.id}`] : [`.btn--${b.id}`, `.btn.btn--${b.id}`]
  const hoverSel = sel.flatMap((s) => [`${s}:hover`, `${s}:focus-visible`])
  const border = b.borderWidth > 0 && col(b.borderColour) ? `${px(b.borderWidth)} solid ${col(b.borderColour)}` : b.borderWidth > 0 ? `${px(b.borderWidth)} solid transparent` : '0'
  const base = [
    'display:inline-block;cursor:pointer;text-decoration:none;',
    decl('background', col(b.bg) || 'transparent'),
    decl('color', col(b.text)),
    decl('border', border),
    decl('border-radius', px(b.radius)),
    decl('box-shadow', SHADOWS[b.shadow]),
    decl('padding', `${px(b.paddingY)} ${px(b.paddingX)}`),
    decl('font-size', px(b.fontSize)),
    decl('font-weight', b.weight),
    decl('letter-spacing', px(b.letterSpacing)),
    decl('text-transform', b.transform),
    decl('transition', `all ${b.transition}ms ease`),
  ].join('')
  const hover = [
    decl('background', col(b.hover.bg)),
    decl('color', col(b.hover.text)),
    decl('border-color', col(b.hover.borderColour)),
    b.hover.lift ? 'transform:translateY(-2px);' : '',
  ].join('')
  const round = (n: number) => Math.round(n * 10) / 10
  const size = (factor: number, mod: string) =>
    `${sel.map((s) => `${s}.btn--${mod}`).join(',')}{padding:${px(round(b.paddingY * factor))} ${px(round(b.paddingX * factor))};font-size:${px(round(b.fontSize * factor))}}`
  return [
    `${sel.join(',')}{${base}}`,
    hover ? `${hoverSel.join(',')}{${hover}}` : '',
    `${sel.join(',')}:focus-visible{outline:2px solid var(--eg-c-accent);outline-offset:2px}`,
    size(0.8, 'sm'),
    size(1.25, 'lg'),
  ]
    .filter(Boolean)
    .join('\n')
}

function tableRules(t: TableStyle, tables: string[], mobileBp: number): string {
  const T = (suffix = '') => tables.map((s) => `${s}${suffix}`).join(',')
  const w = px(t.borderWidth)
  const line = t.borderWidth > 0 && col(t.borderColour) ? `${w} solid ${col(t.borderColour)}` : ''
  const round = t.radius > 0
  const out: string[] = []
  out.push(
    `${T()}{${[
      decl('font-size', px(t.fontSize)),
      round ? `border-collapse:separate;border-spacing:0;border-radius:${px(t.radius)};overflow:hidden;` : 'border-collapse:collapse;',
      round && t.borders === 'all' && line ? decl('border', line) : '',
    ].join('')}}`,
  )
  out.push(
    `${T(' th')},${T(' td')}{${[
      decl('padding', `${px(t.cellPaddingY)} ${px(t.cellPaddingX)}`),
      decl('text-align', t.align),
      t.borders === 'rows' && line ? decl('border-bottom', line) : '',
      t.borders === 'all' && line ? (round ? `border-right:${line};border-bottom:${line};` : decl('border', line)) : '',
      t.borders === 'none' ? 'border:0;' : '',
    ].join('')}}`,
  )
  if (round && t.borders === 'all') {
    out.push(`${T(' tr > :last-child')}{border-right:0}`)
    out.push(`${T(' tbody tr:last-child td')}{border-bottom:0}`)
  }
  out.push(`${T(' th')}{${decl('background', col(t.headerBg))}${decl('color', col(t.headerText))}font-weight:600;}`)
  const row = col(t.rowBg)
  if (row) out.push(`${T(' tbody tr')}{background:${row}}`)
  const stripe = col(t.stripeBg)
  if (stripe) out.push(`${T(' tbody tr:nth-child(even)')}{background:${stripe}}`)
  const hov = col(t.hoverBg)
  if (hov) out.push(`${T(' tbody tr:hover')}{background:${hov}}`)
  out.push(`${T(' caption')}{${decl('color', col(t.captionColour))}font-size:.9em;padding:${px(t.cellPaddingY)} ${px(t.cellPaddingX)};text-align:${t.align};}`)
  if (t.responsive === 'stack') {
    const hideHead = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;'
    out.push(
      `@media (max-width: ${mobileBp}px){${[
        `${T()},${T(' tbody')},${T(' tr')},${T(' td')},${T(' th')}{display:block}`,
        `${T(' thead')}{${hideHead}}`,
        `${T(' tr')}{margin-bottom:12px}`,
        `${T(' td')}{${line ? `border-right:0;border-bottom:${line};` : ''}}`,
        `${T(' td::before')}{content:attr(data-label);display:block;font-weight:600;font-size:.85em;}`,
      ].join('')}}`,
    )
  }
  return out.join('\n')
}

const SPACE_STEPS = [1, 2, 3, 4, 6, 8, 12, 16]

function buildGlobals(g: ThemeGlobals, saved: boolean): string {
  const out: string[] = []
  const { tablet, mobile } = g.breakpoints
  const c = g.containers
  const rootVars = [
    `--eg-radius-sm:${px(g.scales.radiusSm)};--eg-radius-md:${px(g.scales.radiusMd)};--eg-radius-lg:${px(g.scales.radiusLg)};`,
    SPACE_STEPS.map((m, i) => `--eg-space-${i + 1}:${px(g.scales.spaceBase * m)};`).join(''),
    `--eg-shadow-sm:${SHADOWS.soft};--eg-shadow-md:${SHADOWS.medium};--eg-shadow-lg:${SHADOWS.strong};`,
  ].join('')
  out.push(`:root{${rootVars}}`)
  if (saved) {
    out.push(`:root{--max-width:${px(c.maxWidth)};--eg-gap:${px(c.gapDesktop)};--eg-section-pad:${px(c.sectionPaddingDesktop)};}`)
    out.push(`@media (max-width: ${tablet}px){:root{--eg-gap:${px(c.gapTablet)};--eg-section-pad:${px(c.sectionPaddingTablet)};}}`)
    out.push(`@media (max-width: ${mobile}px){:root{--eg-gap:${px(c.gapMobile)};--eg-section-pad:${px(c.sectionPaddingMobile)};}}`)

    const f = g.forms
    const border = f.fieldBorderWidth > 0 && col(f.fieldBorder) ? `${px(f.fieldBorderWidth)} solid ${col(f.fieldBorder)}` : f.fieldBorderWidth > 0 ? `${px(f.fieldBorderWidth)} solid transparent` : '0'
    const fields =
      ':where(.engage-form, form) :where(input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea)'
    const focusColour = col(f.focusBorder)
    out.push(
      `.engage-form{${[decl('--eg-field-bg', col(f.fieldBg)), decl('--eg-ink', col(f.fieldText)), decl('--eg-radius', px(f.fieldRadius)), decl('--eg-line', col(f.fieldBorder)), decl('--eg-accent', focusColour)].join('')}}`,
    )
    out.push(
      `${fields}{${[
        decl('background', col(f.fieldBg)),
        decl('color', col(f.fieldText)),
        decl('border', border),
        decl('border-radius', px(f.fieldRadius)),
        decl('padding', `${px(f.fieldPaddingY)} ${px(f.fieldPaddingX)}`),
        decl('font-size', px(f.fieldFontSize)),
      ].join('')}}`,
    )
    if (focusColour) {
      out.push(`${fields}:focus{border-color:${focusColour};outline:none;box-shadow:0 0 0 3px color-mix(in srgb, ${focusColour} 25%, transparent);}`)
    }
    if (col(f.placeholderColour)) out.push(`${fields}::placeholder{color:${col(f.placeholderColour)}}`)
    out.push(`:where(label, .form-label){${[decl('color', col(f.labelColour)), decl('font-size', px(f.labelSize)), decl('font-weight', f.labelWeight)].join('')}}`)
    if (col(f.errorColour)) out.push(`:where(.form-error){color:${col(f.errorColour)}}`)

    const l = g.links
    const hoverColour = col(l.hoverColour)
    if (hoverColour) out.push(`:where(a:not(.btn):hover){color:${hoverColour}}`)
    const underline = l.underline === 'always' ? 'underline' : 'none'
    out.push(`:where(a:not(.btn)){text-decoration:${underline}}`)
    if (l.underline === 'hover') out.push(':where(a:not(.btn):hover){text-decoration:underline}')

    const im = g.images
    const imgBorder = im.borderWidth > 0 && col(im.borderColour) ? `${px(im.borderWidth)} solid ${col(im.borderColour)}` : ''
    const imgDecls = [decl('border-radius', px(im.radius)), im.shadow !== 'none' ? decl('box-shadow', SHADOWS[im.shadow]) : '', decl('border', imgBorder)].join('')
    if (imgDecls) {
      out.push(`:where(.rich-text img, .built-block img, .block img, article img, .product-gallery img):not(.logo img, header img, footer img){${imgDecls}}`)
    }
  }
  return out.join('\n')
}

const DEFAULT_TABLE_SELECTORS = ['table.eg-table', '.account-table', '.rich-text table', '.dv-table']

export function buildThemeStylesCss(input: unknown, opts: ThemeStylesCssOptions, extra?: { fonts?: InstalledFont[] }): string {
  const styles = sanitizeThemeStyles(input)
  const fonts: FontMap = new Map((extra?.fonts ?? []).map((f) => [f.id, fontStack(f.family, f.category)]))
  const saved = opts.saved === true
  const parts: string[] = []

  // (a) colours
  const legacy = (v: unknown): string => {
    const s = sanitizeColourValue(v)
    return s.startsWith('@') ? '' : s
  }
  const overrides: Record<string, string> = saved
    ? {}
    : {
        primary: legacy(opts.legacy?.primaryColor),
        text: legacy(opts.legacy?.primaryColor),
        accent: legacy(opts.legacy?.accentColor),
        background: legacy(opts.legacy?.backgroundColor),
      }
  const rootVars = styles.colours.map((c) => `--eg-c-${c.id}:${(c.system && overrides[c.id]) || sanitizeColourValue(c.value)};`).join('')
  parts.push(`:root{${rootVars}}`)
  const dark = styles.colours.filter((c) => c.darkValue && !c.darkValue.startsWith('@')).map((c) => `--eg-c-${c.id}:${sanitizeColourValue(c.darkValue)};`)
  if (dark.length) parts.push(`[data-theme="dark"]{${dark.join('')}}`)
  if (saved) {
    parts.push(':root{--color-ink:var(--eg-c-primary);--color-gold:var(--eg-c-accent);--color-cream:var(--eg-c-background);--color-line:var(--eg-c-border)}')
  }

  // (b) typography
  parts.push(buildTypography(styles.typography, saved, fonts, styles.globals.breakpoints))

  // (c) buttons
  parts.push('.btn--block{display:block;width:100%;text-align:center}')
  parts.push('.btn.btn--sm{padding:9px 22px;font-size:.7rem}')
  parts.push('.btn.btn--lg{padding:18px 40px;font-size:1.05rem}')
  for (const b of styles.buttons) parts.push(buildButton(b, saved))

  // (d) tables
  parts.push('.eg-table-wrap{overflow-x:auto}')
  const def = styles.tables.find((t) => t.id === styles.defaultTableId) ?? styles.tables[0]
  if (saved && def) parts.push(tableRules(def, DEFAULT_TABLE_SELECTORS, styles.globals.breakpoints.mobile))
  for (const t of styles.tables) parts.push(tableRules(t, [`table.eg-table--${t.id}`, `.eg-table--${t.id} > table`], styles.globals.breakpoints.mobile))

  parts.push(buildGlobals(styles.globals, saved))
  if (saved) parts.push(sanitizeCustomCss(styles.globals.customCss))

  return parts.filter(Boolean).join('\n').replace(/</g, '')
}
