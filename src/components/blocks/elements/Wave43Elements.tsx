import React from 'react'

import { flag, linkHref, num, pick, str } from './elementUtil'
import './wave43.css'

/**
 * Wave 43 renderers: server components only (no client JS). Motion is CSS only (see wave43.css) and every
 * animation sits inside a prefers-reduced-motion: no-preference guard. Defs live in src/lib/elements/wave43Defs.ts.
 * Text is passed to React as children, so it is escaped; colours are checked against a strict pattern before they
 * go into inline styles.
 */

type P = Record<string, unknown>
type Style = React.CSSProperties

/** A colour the CSS can take as-is: hex, rgb(...) or hsl(...). Anything else falls back. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
const colorOf = (v: unknown, fallback: string): string => {
  const s = str(v).trim()
  return COLOR_RE.test(s) ? s : fallback
}

const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'] as const
type Tag = (typeof TAGS)[number]
const tagOf = (v: unknown, fallback: Tag): Tag => pick(v, TAGS, fallback)

/** An element at the chosen tag. Written out per tag so each one is a static element, not a tag picked during render. */
const Tagged: React.FC<{ tag: Tag; className?: string; style?: Style; children?: React.ReactNode }> = ({ tag, ...rest }) => {
  switch (tag) {
    case 'h1':
      return <h1 {...rest} />
    case 'h3':
      return <h3 {...rest} />
    case 'h4':
      return <h4 {...rest} />
    case 'h5':
      return <h5 {...rest} />
    case 'h6':
      return <h6 {...rest} />
    case 'p':
      return <p {...rest} />
    case 'span':
      return <span {...rest} />
    default:
      return <h2 {...rest} />
  }
}

/** Text that is hidden on screen but still read by screen readers and crawlers. */
const SrOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="be-el-43-sr">{children}</span>

/* ---------- gradient text ---------- */

/**
 * `gradient-text`: the text is filled with a linear gradient (background-clip: text). With "animated", the gradient
 * is written twice over a double-width background and its position slides by half, so the loop joins up seamlessly.
 */
export const GradientTextElement: React.FC<P> = (p) => {
  const text = str(p.text).trim()
  if (!text) return null
  const stops = [p.color1, p.color2, p.color3].map((c) => colorOf(c, '')).filter(Boolean)
  if (stops.length === 0) stops.push('#2e3192', '#00a9ff')
  if (stops.length === 1) stops.push(stops[0])
  const animated = flag(p.animated, false)
  const list = animated ? [...stops, ...stops] : stops
  const angle = num(p.angle, 90, 0, 360)
  const min = num(p.sizeMin, 32, 10, 200)
  const max = Math.max(min, num(p.sizeMax, 56, 10, 300))
  // Fluid size: min at 320px viewports, max at 1600px and up, linear in between.
  const size = `clamp(${min}px, calc(${min}px + ${max - min} * (100vw - 320px) / 1280), ${max}px)`
  const style: Style = { backgroundImage: `linear-gradient(${angle}deg, ${list.join(', ')})`, fontSize: size }
  return (
    <Tagged tag={tagOf(p.tag, 'h2')} className={animated ? 'be-el-43-grad be-el-43-grad--anim' : 'be-el-43-grad'} style={style}>
      {text}
    </Tagged>
  )
}

/* ---------- split text ---------- */

/** Animated pieces per element. Anything past this is plain text, so long copy never gets hundreds of animated spans. */
const SPLIT_LIMIT = 200

/**
 * `split-text`: the text is split into spans at render time, each with --i set to its index. The reveal is CSS only
 * and runs on scroll (view timeline) where supported; elsewhere the text is simply visible. The full text is also
 * in a visually hidden copy, and the animated pieces are hidden from assistive technology.
 */
export const SplitTextElement: React.FC<P> = (p) => {
  const text = str(p.text).trim()
  if (!text) return null
  const by = pick(p.by, ['word', 'letter'] as const, 'word')
  const effect = pick(p.effect, ['fade-up', 'blur', 'slide'] as const, 'fade-up')
  const stagger = num(p.stagger, 80, 0, 500)
  let n = 0
  const items: React.ReactNode[] = []
  text.split(/(\s+)/).forEach((chunk, w) => {
    if (!chunk) return
    if (/^\s+$/.test(chunk)) {
      items.push(chunk)
      return
    }
    if (by === 'word') {
      if (n < SPLIT_LIMIT) {
        items.push(
          <span key={w} className="be-el-43-split__item" style={{ '--i': n } as Style}>
            {chunk}
          </span>,
        )
        n++
      } else items.push(chunk)
      return
    }
    // Letters: each word is kept together on one line, so a line break can only fall between words.
    const pieces = Array.from(chunk).map((ch, k) => {
      if (n >= SPLIT_LIMIT) return ch
      const el = (
        <span key={k} className="be-el-43-split__item" style={{ '--i': n } as Style}>
          {ch}
        </span>
      )
      n++
      return el
    })
    items.push(
      <span key={w} className="be-el-43-split__word">
        {pieces}
      </span>,
    )
  })
  return (
    <Tagged tag={tagOf(p.tag, 'h2')} className={`be-el-43-split be-el-43-split--${effect}`} style={{ '--be-el-43-stagger': `${stagger}ms` } as Style}>
      <SrOnly>{text}</SrOnly>
      <span aria-hidden="true">{items}</span>
    </Tagged>
  )
}

/* ---------- highlight text ---------- */

const MARKERS = ['underline', 'underline-wavy', 'box', 'circle'] as const

/** `highlight-text`: a sentence with one phrase marked. The marker is drawn in CSS (see wave43.css). */
export const HighlightTextElement: React.FC<P> = (p) => {
  const before = str(p.before).trim()
  const phrase = str(p.phrase).trim()
  const after = str(p.after).trim()
  if (!before && !phrase && !after) return null
  const marker = pick(p.style, MARKERS, 'underline')
  const trigger = pick(p.trigger, ['load', 'view'] as const, 'view')
  const c = colorOf(p.color, '#f5a623')
  return (
    <Tagged tag={tagOf(p.tag, 'p')} className="be-el-43-hl-text">
      {before && `${before} `}
      {phrase && (
        <span className={`be-el-43-hl be-el-43-hl--${marker} be-el-43-hl--${trigger}`} style={{ '--be-el-43-c': c } as Style}>
          {phrase}
        </span>
      )}
      {after && ` ${after}`}
    </Tagged>
  )
}

/* ---------- outline text ---------- */

/** `outline-text`: big text with a stroke and no fill. Hover fills it in when enabled. Clipping keeps it on one line. */
export const OutlineTextElement: React.FC<P> = (p) => {
  const text = str(p.text).trim()
  if (!text) return null
  const size = num(p.size, 160, 16, 300)
  const stroke = num(p.stroke, 2, 0.5, 12)
  const outline = colorOf(p.color, '#2e3192')
  const fill = colorOf(p.fillColor, '#00a9ff')
  const cls = ['be-el-43-outline', flag(p.fillOnHover, true) && 'be-el-43-outline--hover', flag(p.clip, false) && 'be-el-43-outline--clip'].filter(Boolean).join(' ')
  const style = { fontSize: `${size}px`, '--be-el-43-c': outline, '--be-el-43-fill': fill, '--be-el-43-sw': `${stroke}px` } as Style
  return (
    <Tagged tag={tagOf(p.tag, 'h2')} className={cls} style={style}>
      {text}
    </Tagged>
  )
}

/* ---------- count up ---------- */

const COUNT_LIMIT = 1000000000

/**
 * `count-up`: the number is an integer counter (scaled by 10^decimals) held in a registered custom property. The
 * animation moves that property from start to end, and CSS counter() prints it, with a decimal point and padding
 * added by the counter styles. Where counter math is not supported, the static final number shows instead. The
 * final number is also the aria-label, so screen readers never hear the intermediate values.
 */
export const CountUpElement: React.FC<P> = (p) => {
  const start = num(p.start, 0, 0, COUNT_LIMIT)
  const end = num(p.end, 100, 0, COUNT_LIMIT)
  const decimals = Number(pick(str(p.decimals, '0'), ['0', '1', '2'] as const, '0'))
  const scale = 10 ** decimals
  const prefix = str(p.prefix)
  const suffix = str(p.suffix)
  const label = str(p.label).trim()
  const duration = num(p.duration, 1600, 200, 5000)
  const finalText = end.toFixed(decimals)
  const counterStyle = {
    '--be-el-43-from': Math.round(start * scale),
    '--be-el-43-to': Math.round(end * scale),
    '--be-el-43-s': Math.round(end * scale),
    '--be-el-43-k': scale,
    '--be-el-43-d': `${duration}ms`,
  } as Style
  return (
    <div className="be-el-43-count-wrap">
      <span className="be-el-43-count" role="img" aria-label={`${prefix}${finalText}${suffix}`}>
        <span className="be-el-43-count__pre" aria-hidden="true">
          {prefix}
        </span>
        <span className={`be-el-43-count__num be-el-43-count__num--d${decimals}`} aria-hidden="true" style={counterStyle}>
          <span className="be-el-43-count__static">{finalText}</span>
        </span>
        <span className="be-el-43-count__suf" aria-hidden="true">
          {suffix}
        </span>
      </span>
      {label && <span className="be-el-43-count__label">{label}</span>}
    </div>
  )
}

/* ---------- draw line ---------- */

/** One path per shape, in a 300 x 60 box. Written with pathLength 1 so the draw animation works in fixed units. */
const SHAPES = {
  wave: 'M0 30 Q25 0 50 30 T100 30 T150 30 T200 30 T250 30 T300 30',
  zigzag: 'M0 50 L30 10 L60 50 L90 10 L120 50 L150 10 L180 50 L210 10 L240 50 L270 10 L300 50',
  loop: 'M10 34 C10 4 70 4 80 26 C90 50 130 50 140 28 C150 6 200 6 210 28 C218 46 250 46 260 30 C266 20 280 14 292 22',
  underline: 'M5 40 Q150 56 295 34',
  arrow: 'M10 30 L280 30 M250 10 L285 30 L250 50',
} as const

/** `draw-line`: a decorative SVG path that draws itself on scroll where supported. Fully drawn everywhere else. */
export const DrawLineElement: React.FC<P> = (p) => {
  const shape = pick(p.shape, ['wave', 'zigzag', 'loop', 'underline', 'arrow'] as const, 'wave')
  const color = colorOf(p.color, '#2e3192')
  const width = num(p.strokeWidth, 4, 1, 20)
  return (
    <div className="be-el-43-draw" aria-hidden="true">
      <svg className="be-el-43-draw__svg" viewBox="0 0 300 60" focusable="false">
        <path className="be-el-43-draw__path" d={SHAPES[shape]} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ---------- bento grid ---------- */

const BENTO_LIMIT = 8

/** Dark backgrounds get light text. Only 3- and 6-digit hex colours are measured; anything else gets dark text. */
function isDark(c: string): boolean {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c)
  const long = /^#([0-9a-f]{6})$/i.exec(c)
  const hex = short ? short.slice(1).map((d) => d + d).join('') : long ? long[1] : ''
  if (!hex) return false
  const n = parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 150
}

/** Span values are 1 or 2, whatever the stored value (a select stores strings). */
const span = (v: unknown): number => Math.round(num(v, 1, 1, 2))

/**
 * `bento-grid`: a four-column grid of tiles with mixed widths and heights. Tiles are CSS spans set through custom
 * properties, so the one-column layout on phones can reset them in CSS. A tile link covers the whole tile.
 */
export const BentoGridElement: React.FC<P> = (p) => {
  const raw = Array.isArray(p.tiles) ? p.tiles : []
  const tiles = raw
    .map((row) => (row && typeof row === 'object' ? (row as P) : {}))
    .map((r) => ({
      title: str(r.title).trim(),
      text: str(r.text).trim(),
      href: linkHref(r.href),
      cols: span(r.colspan),
      rows: span(r.rowspan),
      bg: colorOf(r.background, '#f4f1ea'),
    }))
    .filter((t) => t.title || t.text)
    .slice(0, BENTO_LIMIT)
  if (tiles.length === 0) return null
  return (
    <ul className="be-el-43-bento">
      {tiles.map((t, i) => {
        const fg = isDark(t.bg) ? '#ffffff' : '#1f2230'
        const style = { '--be-el-43-cs': t.cols, '--be-el-43-rs': t.rows, background: t.bg, color: fg } as Style
        return (
          <li key={i} className="be-el-43-bento__tile" style={style}>
            <h3 className="be-el-43-bento__title">{t.href ? <a className="be-el-43-bento__link" href={t.href}>{t.title}</a> : t.title}</h3>
            {t.text && <p className="be-el-43-bento__text">{t.text}</p>}
          </li>
        )
      })}
    </ul>
  )
}

/** Component table for elementComponents.tsx, keyed by element type. */
export const WAVE43_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'gradient-text': GradientTextElement,
  'split-text': SplitTextElement,
  'highlight-text': HighlightTextElement,
  'outline-text': OutlineTextElement,
  'count-up': CountUpElement,
  'draw-line': DrawLineElement,
  'bento-grid': BentoGridElement,
}
