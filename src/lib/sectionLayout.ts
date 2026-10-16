/**
 * Section / column layout model and its CSS.
 *
 * Everything here is OPTIONAL data layered on top of the existing section tree: a
 * section or column with none of these keys renders exactly as it did before. The
 * values live inside JSON that is already stored (a section's `design.layout`, a
 * column's `layout`), so no schema column or migration is involved.
 *
 * Rendering is split in two so the public site and the editor canvas stay identical:
 *  - per-element data (attributes, custom properties, a few inline declarations) is
 *    produced by sectionLayoutProps() / columnLayoutStyle();
 *  - the static rules that read that data are produced by sectionLayoutCss(), which
 *    the canvas injects and which styles.css mirrors (a test keeps the two in sync).
 */

export type LayoutDevice = 'desktop' | 'tablet' | 'mobile'
export type PerDevice<T> = { desktop?: T; tablet?: T; mobile?: T }

export type FlowDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse'
export type JustifyContent = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
export type AlignItemsValue = 'start' | 'center' | 'end' | 'stretch'
export type AlignSelfValue = 'stretch' | 'start' | 'center' | 'end'
export type VerticalAlign = 'top' | 'middle' | 'bottom' | 'between'

export type SectionLayout = {
  /** Flow per device. Tablet falls back to desktop and mobile to tablet when unset. */
  direction?: PerDevice<FlowDirection>
  /** false keeps every column on one line. Unset (wrap) is today's behaviour. */
  wrap?: boolean
  /** Space between columns in px, per device (same fallback chain). */
  gap?: PerDevice<number>
  justify?: JustifyContent
  alignItems?: AlignItemsValue
  /** 'boxed' centres the section inside a max width; unset/'full' fills its parent. */
  contentWidth?: 'boxed' | 'full'
  /** Boxed max width in px; unset uses the site container width. */
  boxedWidth?: number
}

export type ColumnLayout = {
  grow?: number
  shrink?: number
  alignSelf?: AlignSelfValue
  order?: PerDevice<number>
  minWidth?: number
  vAlign?: VerticalAlign
  padding?: { top?: number; right?: number; bottom?: number; left?: number }
}

export const DEVICES: LayoutDevice[] = ['desktop', 'tablet', 'mobile']
export const DEFAULT_BREAKPOINTS = { tablet: 900, mobile: 600 }
export const FLOW_DIRECTIONS: FlowDirection[] = ['row', 'row-reverse', 'column', 'column-reverse']

const DEVICE_KEY: Record<LayoutDevice, 'd' | 't' | 'm'> = { desktop: 'd', tablet: 't', mobile: 'm' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined

function perDevice<T>(raw: unknown, read: (v: unknown) => T | undefined): PerDevice<T> | undefined {
  if (!isObj(raw)) return undefined
  const out: PerDevice<T> = {}
  for (const d of DEVICES) {
    const v = read(raw[d])
    if (v !== undefined) out[d] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Tolerant reader for a stored section layout; junk becomes undefined rather than throwing. */
export function parseSectionLayout(raw: unknown): SectionLayout | undefined {
  if (!isObj(raw)) return undefined
  const out: SectionLayout = {}
  const direction = perDevice(raw.direction, (v) => pick(v, FLOW_DIRECTIONS))
  if (direction) out.direction = direction
  if (raw.wrap === false) out.wrap = false
  const gap = perDevice(raw.gap, (v) => (isNum(v) && v >= 0 ? v : undefined))
  if (gap) out.gap = gap
  const justify = pick(raw.justify, ['start', 'center', 'end', 'between', 'around', 'evenly'] as const)
  if (justify) out.justify = justify
  const alignItems = pick(raw.alignItems, ['start', 'center', 'end', 'stretch'] as const)
  if (alignItems) out.alignItems = alignItems
  if (raw.contentWidth === 'boxed') out.contentWidth = 'boxed'
  if (isNum(raw.boxedWidth) && raw.boxedWidth > 0) out.boxedWidth = raw.boxedWidth
  return Object.keys(out).length > 0 ? out : undefined
}

export function parseColumnLayout(raw: unknown): ColumnLayout | undefined {
  if (!isObj(raw)) return undefined
  const out: ColumnLayout = {}
  if (isNum(raw.grow) && raw.grow >= 0) out.grow = raw.grow
  if (isNum(raw.shrink) && raw.shrink >= 0) out.shrink = raw.shrink
  const alignSelf = pick(raw.alignSelf, ['stretch', 'start', 'center', 'end'] as const)
  if (alignSelf) out.alignSelf = alignSelf
  const order = perDevice(raw.order, (v) => (isNum(v) ? Math.round(v) : undefined))
  if (order) out.order = order
  if (isNum(raw.minWidth) && raw.minWidth >= 0) out.minWidth = raw.minWidth
  const vAlign = pick(raw.vAlign, ['top', 'middle', 'bottom', 'between'] as const)
  if (vAlign) out.vAlign = vAlign
  if (isObj(raw.padding)) {
    const padding: NonNullable<ColumnLayout['padding']> = {}
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const v = raw.padding[side]
      if (isNum(v) && v >= 0) padding[side] = v
    }
    if (Object.keys(padding).length > 0) out.padding = padding
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Each device's effective direction after the desktop -> tablet -> mobile fallback. */
export function resolveDirections(layout?: SectionLayout): Record<LayoutDevice, FlowDirection> {
  const d = layout?.direction?.desktop ?? 'row'
  const t = layout?.direction?.tablet ?? d
  const m = layout?.direction?.mobile ?? t
  return { desktop: d, tablet: t, mobile: m }
}

const JUSTIFY_CSS: Record<JustifyContent, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}
const ALIGN_CSS: Record<AlignItemsValue | AlignSelfValue, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}
const VALIGN_CSS: Record<VerticalAlign, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
  between: 'space-between',
}

export type SectionLayoutProps = {
  /** Extra class names to add after the section's base class. */
  className: string
  /** data-* attributes (dir per device, no-wrap). */
  attrs: Record<string, string>
  /** Inline style: custom properties plus justify / align-items. */
  style: Record<string, string>
}

/** Markup-side data for a section. Empty (no class, attrs or style) when nothing is configured. */
export function sectionLayoutProps(rawLayout: unknown, baseClass = 'be-section'): SectionLayoutProps {
  const layout = parseSectionLayout(rawLayout)
  const out: SectionLayoutProps = { className: '', attrs: {}, style: {} }
  if (!layout) return out

  const dirs = resolveDirections(layout)
  if (DEVICES.some((d) => dirs[d] !== 'row')) {
    for (const d of DEVICES) out.attrs[`data-dir-${DEVICE_KEY[d]}`] = dirs[d]
  }
  if (layout.wrap === false) out.attrs['data-nowrap'] = '1'
  for (const d of DEVICES) {
    const g = layout.gap?.[d]
    if (g !== undefined) out.style[`--be-gap-${DEVICE_KEY[d]}`] = `${g}px`
  }
  if (layout.justify) out.style.justifyContent = JUSTIFY_CSS[layout.justify]
  if (layout.alignItems) out.style.alignItems = ALIGN_CSS[layout.alignItems]
  if (layout.contentWidth === 'boxed') {
    out.className = `${baseClass}--boxed`
    if (layout.boxedWidth) out.style['--be-boxed'] = `${layout.boxedWidth}px`
  }
  return out
}

/** Inline style for a column's own layout settings (kept separate from its width vars). */
export function columnLayoutStyle(rawLayout: unknown): Record<string, string> {
  const layout = parseColumnLayout(rawLayout)
  const style: Record<string, string> = {}
  if (!layout) return style
  if (layout.grow !== undefined) style['--be-col-grow'] = String(layout.grow)
  if (layout.shrink !== undefined) style['--be-col-shrink'] = String(layout.shrink)
  for (const d of DEVICES) {
    const o = layout.order?.[d]
    if (o !== undefined) style[`--be-col-order-${DEVICE_KEY[d]}`] = String(o)
  }
  if (layout.alignSelf) style.alignSelf = ALIGN_CSS[layout.alignSelf]
  if (layout.minWidth !== undefined) style.minWidth = `${layout.minWidth}px`
  if (layout.vAlign) {
    style.display = 'flex'
    style.flexDirection = 'column'
    style.justifyContent = VALIGN_CSS[layout.vAlign]
    // A column only has spare height to align inside when it is stretched to the row.
    if (!layout.alignSelf) style.alignSelf = 'stretch'
  }
  if (layout.padding) {
    if (layout.padding.top !== undefined) style.paddingTop = `${layout.padding.top}px`
    if (layout.padding.right !== undefined) style.paddingRight = `${layout.padding.right}px`
    if (layout.padding.bottom !== undefined) style.paddingBottom = `${layout.padding.bottom}px`
    if (layout.padding.left !== undefined) style.paddingLeft = `${layout.padding.left}px`
  }
  return style
}

/**
 * The basis of a percentage column with the section's gaps taken out of it.
 *
 * A bare `50%` basis is the root of the "two 50% columns stack vertically" bug: two
 * 50% boxes plus the gap between them are wider than the row, so flex-wrap moves the
 * second one down. Each column gives up its share of the gaps (1 - fraction of the
 * gap) so a full row of percentages always sums to exactly the row width; 0.1px of
 * slack absorbs sub-pixel rounding. Returns undefined for 100% (needs no adjustment).
 */
export function percentBasisWithGap(percent: number): string | undefined {
  const p = Math.min(100, Math.max(0, percent))
  if (p >= 100) return undefined
  const n = Math.round(p * 10000) / 10000
  return `calc(${n}% - var(--be-gap, 0px) * ${Math.round((1 - n / 100) * 10000) / 10000} - 0.1px)`
}

/* ------------------------------------------------------------------------- */
/* Static CSS                                                                  */
/* ------------------------------------------------------------------------- */

export type SectionLayoutCssOptions = {
  /** Section element selector, e.g. '.be-section'. */
  section: string
  /** Column element selector, e.g. '.be-column'. */
  column: string
  /** Gap used when a section sets none (px). */
  defaultGap: number
  /** Max-width breakpoints, in px (the site's tablet / mobile edges). */
  breakpoints?: { tablet: number; mobile: number }
  /** Declarations appended to the base section rule (canvas padding etc). */
  sectionExtra?: string
  /** Declarations appended to the base column rule. */
  columnExtra?: string
}

const COL_RESET =
  '--be-col-d:initial;--be-col-t:initial;--be-col-m:initial;' +
  '--be-col-d-b:initial;--be-col-t-b:initial;--be-col-m-b:initial;' +
  '--be-col-d-g:initial;--be-col-t-g:initial;--be-col-m-g:initial;' +
  '--be-col-grow:initial;--be-col-shrink:initial;' +
  '--be-col-order-d:initial;--be-col-order-t:initial;--be-col-order-m:initial'

/** var() chain for one device, falling back toward desktop; `suffixes` are tried per device in order. */
function chain(device: 'd' | 't' | 'm', names: (k: string) => string[], last: string): string {
  const order = device === 'm' ? ['m', 't', 'd'] : device === 't' ? ['t', 'd'] : ['d']
  const parts = order.flatMap((k) => names(k))
  return parts.reduceRight((acc, name) => `var(${name},${acc})`, last)
}

const basisChain = (k: 'd' | 't' | 'm') => chain(k, (x) => [`--be-col-${x}-b`, `--be-col-${x}`], '100%')
const growChain = (k: 'd' | 't' | 'm') => `var(--be-col-grow,${chain(k, (x) => [`--be-col-${x}-g`], '0')})`
const orderChain = (k: 'd' | 't' | 'm') => chain(k, (x) => [`--be-col-order-${x}`], '0')

/**
 * Emits the rules that turn the data from sectionLayoutProps() / columnWidthVars() into
 * layout. Order matters and is part of the contract (and unit-tested): base rules, then
 * the desktop direction rules, then `@media (max-width:tablet)`, then mobile - so a
 * narrower breakpoint always overrides the wider one.
 */
export function sectionLayoutCss(opts: SectionLayoutCssOptions): string {
  const S = opts.section
  const C = opts.column
  const bp = opts.breakpoints ?? DEFAULT_BREAKPOINTS
  const boxed = `${S}--boxed`
  const out: string[] = []

  out.push(
    `${S}{--be-gap-d:initial;--be-gap-t:initial;--be-gap-m:initial;--be-boxed:initial;` +
      `--be-gap:var(--be-gap-d,${opts.defaultGap}px);display:flex;flex-wrap:wrap;gap:var(--be-gap);align-items:flex-start;${opts.sectionExtra ?? ''}}`,
  )
  out.push(`${S}[data-nowrap]{flex-wrap:nowrap}`)
  out.push(`${boxed}{width:100%;max-width:var(--be-boxed,var(--max-width,1200px));margin-left:auto;margin-right:auto}`)
  out.push(
    `${C}{${COL_RESET};min-width:0;flex-grow:${growChain('d')};flex-shrink:var(--be-col-shrink,1);` +
      `flex-basis:${basisChain('d')};order:${orderChain('d')};${opts.columnExtra ?? ''}}`,
  )

  const dirRules = (k: 'd' | 't' | 'm', restoreRow: boolean): string[] => {
    const rules: string[] = []
    for (const dir of FLOW_DIRECTIONS) {
      const sel = `${S}[data-dir-${k}="${dir}"]`
      rules.push(`${sel}{flex-direction:${dir}}`)
      if (dir.startsWith('column')) {
        rules.push(`${sel}>${C}{flex-basis:auto;flex-grow:0;width:100%}`)
      } else if (restoreRow) {
        rules.push(`${sel}>${C}{flex-basis:${basisChain(k)};flex-grow:${growChain(k)};width:auto}`)
      }
    }
    return rules
  }

  out.push(...dirRules('d', false))

  const media = (k: 't' | 'm', max: number) => {
    out.push(
      `@media (max-width:${max}px){` +
        `${S}{--be-gap:var(--be-gap-${k},${k === 'm' ? 'var(--be-gap-t,' : ''}var(--be-gap-d,${opts.defaultGap}px)${k === 'm' ? ')' : ''})}` +
        `${C}{flex-basis:${basisChain(k)};flex-grow:${growChain(k)};order:${orderChain(k)}}` +
        `${dirRules(k, true).join('')}}`,
    )
  }
  media('t', bp.tablet)
  media('m', bp.mobile)

  return out.join('')
}

/** The rule set the public site ships in styles.css (kept in sync by a test). */
export const PUBLIC_SECTION_CSS_OPTIONS: SectionLayoutCssOptions = {
  section: '.be-section',
  column: '.be-column',
  defaultGap: 24,
}
