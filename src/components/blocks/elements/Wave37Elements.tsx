/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { cells, flag, lines, linkAttrs, linkHref, mediaOf, num, pick, str } from './elementUtil'
import './wave37.css'

/**
 * Wave 37 renderers: server components only (no client JS). Motion, hover and focus are CSS only (see
 * wave37.css). Defs live in src/lib/elements/wave37Defs.ts.
 */

type P = Record<string, unknown>
type Style = React.CSSProperties

/** A colour the CSS can take as-is: hex, rgb(...) or hsl(...). Anything else falls back. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
const colorOf = (v: unknown, fallback: string): string => {
  const s = str(v).trim()
  return COLOR_RE.test(s) ? s : fallback
}

/** Same input, same id, on the server and in the browser. FNV-1a over the strings, base 36. */
function hashId(...parts: string[]): string {
  let h = 0x811c9dc5
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= 0x1f
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** A user-typed id reduced to letters, digits, "-" and "_", starting with a letter. Empty when nothing usable is left. */
const idSafe = (v: unknown): string => {
  const s = str(v).trim().replace(/[^A-Za-z0-9_-]/g, '')
  return /^[A-Za-z]/.test(s) ? s : ''
}

/* ---------- text ticker ---------- */

/**
 * `text-ticker`: the items run in a flex track twice over. The second copy is aria-hidden and only shown while
 * the animation runs, so the loop is seamless and screen readers hear the list once. Without motion the track
 * is a plain wrapped list.
 */
export const TextTickerElement: React.FC<P> = (p) => {
  const items = lines(p.items).slice(0, 40)
  if (items.length === 0) return null
  const direction = pick(p.direction, ['left', 'right'] as const, 'left')
  const speed = Math.round(num(p.speed, 30, 5, 120))
  const pause = flag(p.pauseOnHover, true)
  const list = (copy: boolean) => (
    <ul className={copy ? 'be-el-ticker__list be-el-ticker__list--copy' : 'be-el-ticker__list'} aria-hidden={copy ? 'true' : undefined}>
      {items.map((t, i) => (
        <li key={i} className="be-el-ticker__item">
          {t}
        </li>
      ))}
    </ul>
  )
  const cls = `be-el-ticker be-el-ticker--${direction}${pause ? ' be-el-ticker--pause' : ''}`
  return (
    <div className={cls}>
      <div className="be-el-ticker__track" style={{ '--be-el-ticker-dur': `${speed}s` } as Style}>
        {list(false)}
        {list(true)}
      </div>
    </div>
  )
}

/* ---------- reading progress ---------- */

/** `reading-progress`: a fixed bar whose width follows the page scroll (CSS scroll-driven animation). Decorative, so aria-hidden. */
export const ReadingProgressElement: React.FC<P> = (p) => {
  const height = Math.round(num(p.height, 4, 1, 24))
  const color = colorOf(p.color, '#2e3192')
  const position = pick(p.position, ['top', 'bottom'] as const, 'top')
  return <div aria-hidden="true" className={`be-el-progress be-el-progress--${position}`} style={{ '--be-el-h': `${height}px`, '--be-el-c': color } as Style} />
}

/* ---------- content switcher ---------- */

/**
 * `content-switcher`: two radio inputs drive the switch. The labels are the visible tabs (the radios are visually
 * hidden but still focusable, so arrow keys work natively). Both panels stay in the markup; the one not checked
 * is display:none. Tabs are radio labels rather than role="tab" because aria-selected cannot be set from CSS.
 */
export const ContentSwitcherElement: React.FC<P> = (p) => {
  const labelA = str(p.labelA).trim() || 'A'
  const labelB = str(p.labelB).trim() || 'B'
  const bodyA = lines(p.contentA)
  const bodyB = lines(p.contentB)
  if (bodyA.length === 0 && bodyB.length === 0) return null
  const start = pick(p.defaultPanel, ['A', 'B'] as const, 'A')
  const style = pick(p.style, ['pill', 'underline'] as const, 'pill')
  const uid = idSafe(p.uid) || `sw${hashId(labelA, labelB, ...bodyA, ...bodyB)}`
  const panel = (key: 'a' | 'b', body: string[]) => (
    <div className={`be-el-switch__panel be-el-switch__panel--${key}`} role="region" aria-labelledby={`${uid}-tab-${key}`}>
      {body.map((t, i) => (
        <p key={i} className="be-el-switch__text">
          {t}
        </p>
      ))}
    </div>
  )
  return (
    <div className={`be-el-switch be-el-switch--${style}`}>
      <input type="radio" className="be-el-switch__radio be-el-switch__radio--a" id={`${uid}-a`} name={uid} defaultChecked={start === 'A'} />
      <input type="radio" className="be-el-switch__radio be-el-switch__radio--b" id={`${uid}-b`} name={uid} defaultChecked={start === 'B'} />
      <div className="be-el-switch__bar">
        <label id={`${uid}-tab-a`} htmlFor={`${uid}-a`} className="be-el-switch__tab be-el-switch__tab--a">
          {labelA}
        </label>
        <label id={`${uid}-tab-b`} htmlFor={`${uid}-b`} className="be-el-switch__tab be-el-switch__tab--b">
          {labelB}
        </label>
      </div>
      <div className="be-el-switch__panels">
        {panel('a', bodyA)}
        {panel('b', bodyB)}
      </div>
    </div>
  )
}

/* ---------- tooltip ---------- */

/** `tooltip`: the text is focusable and points at its tip with aria-describedby. The tip is shown on hover or keyboard focus. */
export const TooltipElement: React.FC<P> = (p) => {
  const text = str(p.text).trim()
  const tip = str(p.tip).trim()
  if (!text) return null
  const position = pick(p.position, ['top', 'bottom'] as const, 'top')
  const id = `tip${hashId(text, tip, position)}`
  return (
    <span className={`be-el-tip be-el-tip--${position}`}>
      <span className="be-el-tip__text" tabIndex={0} aria-describedby={tip ? id : undefined}>
        {text}
      </span>
      {tip && (
        <span role="tooltip" id={id} className="be-el-tip__bubble">
          {tip}
        </span>
      )}
    </span>
  )
}

/* ---------- image hotspots ---------- */

const SPOT_MAX = 30

/** "25%" or "25" to a number from 0 to 100. Null when it is not a number. */
const pctOf = (v: string): number | null => {
  const n = Number(v.replace('%', '').trim())
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
}

type Spot = { x: number; y: number; title: string; text: string }

/**
 * `hotspots`: a picture with numbered buttons placed by percentage. Each note is a CSS popover on :hover and
 * :focus-within. A visually hidden list repeats every title and text in the markup for search engines and
 * screen readers that do not read the popovers.
 */
export const HotspotsElement: React.FC<P> = (p) => {
  const media = mediaOf(p.image)
  if (!media) return <div className="be-el-spots-empty">Choose a picture.</div>
  const spots: Spot[] = []
  for (const [x = '', y = '', title = '', text = ''] of cells(p.items, 4)) {
    const px = pctOf(x)
    const py = pctOf(y)
    if (px !== null && py !== null && title.trim()) spots.push({ x: px, y: py, title: title.trim(), text: text.trim() })
    if (spots.length >= SPOT_MAX) break
  }
  const alt = str(p.alt).trim() || media.alt || ''
  const uid = `hs${hashId(media.url ?? '', ...spots.map((s) => `${s.x},${s.y},${s.title},${s.text}`))}`
  return (
    <figure className="be-el-spots">
      <div className="be-el-spots__frame">
        <img className="be-el-spots__img" src={media.url} alt={alt} loading="lazy" decoding="async" />
        {spots.map((s, i) => {
          const id = `${uid}-${i}`
          const cls = ['be-el-spot', s.y < 35 ? 'be-el-spot--below' : '', s.x > 75 ? 'be-el-spot--left' : ''].filter(Boolean).join(' ')
          return (
            <span key={i} className={cls} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <button type="button" className="be-el-spot__btn" aria-describedby={id}>
                <span aria-hidden="true">{i + 1}</span>
                <span className="be-el-visually-hidden">{s.title}</span>
              </button>
              <span role="tooltip" id={id} className="be-el-spot__pop">
                <span className="be-el-spot__title">{s.title}</span>
                {s.text && <span className="be-el-spot__text">{s.text}</span>}
              </span>
            </span>
          )
        })}
      </div>
      {spots.length > 0 && (
        <ul className="be-el-visually-hidden">
          {spots.map((s, i) => (
            <li key={i}>
              <strong>{s.title}</strong>
              {s.text ? ` ${s.text}` : ''}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

/* ---------- table of contents ---------- */

/** Anchors must be a valid HTML id made of letters, digits, "-" and "_". Anything else is skipped, not repaired. */
const ANCHOR_RE = /^[A-Za-z][A-Za-z0-9_-]*$/

/** `toc`: a labelled nav of links to in-page anchors. Entries with a bad or empty anchor are left out. */
export const TocElement: React.FC<P> = (p) => {
  const entries: { label: string; anchor: string }[] = []
  for (const [label = '', anchor = ''] of cells(p.items, 2)) {
    const a = anchor.trim()
    if (label.trim() && ANCHOR_RE.test(a)) entries.push({ label: label.trim(), anchor: a })
  }
  if (entries.length === 0) return null
  const title = str(p.title).trim()
  const numbered = pick(p.style, ['numbered', 'bullets'] as const, 'numbered') === 'numbered'
  const cls = `be-el-toc be-el-toc--${numbered ? 'numbered' : 'bullets'}${flag(p.sticky, false) ? ' be-el-toc--sticky' : ''}`
  const items = entries.map((e, i) => (
    <li key={i} className="be-el-toc__item">
      <a href={`#${e.anchor}`}>{e.label}</a>
    </li>
  ))
  return (
    <nav className={cls} aria-label={title || 'Table of contents'}>
      {title && <p className="be-el-toc__title">{title}</p>}
      {numbered ? <ol className="be-el-toc__list">{items}</ol> : <ul className="be-el-toc__list">{items}</ul>}
    </nav>
  )
}

/* ---------- sticky bar ---------- */

/**
 * `sticky-bar`: a full-width bar. "inline" sits in the page flow; "fixed" pins it to the top or bottom edge of
 * the window. The message is a paragraph and the button is a real link (a span when no link is set).
 */
export const StickyBarElement: React.FC<P> = (p) => {
  const message = str(p.text).trim()
  const label = str(p.buttonLabel).trim()
  if (!message && !label) return null
  const href = linkHref(p.link)
  const fixed = pick(p.mode, ['inline', 'fixed'] as const, 'inline') === 'fixed'
  const edge = pick(p.position, ['top', 'bottom'] as const, 'top')
  const vars = {
    '--be-el-bg': colorOf(p.background, '#2e3192'),
    '--be-el-fg': colorOf(p.textColor, '#ffffff'),
    '--be-el-btn': colorOf(p.buttonColor, '#f5a623'),
  } as Style
  const cls = `be-el-sticky${fixed ? ` be-el-sticky--fixed be-el-sticky--${edge}` : ''}`
  return (
    <aside className={cls} style={vars}>
      {message && <p className="be-el-sticky__text">{message}</p>}
      {label &&
        (href ? (
          <a className="be-el-sticky__btn" href={href} {...linkAttrs(p.link)}>
            {label}
          </a>
        ) : (
          <span className="be-el-sticky__btn">{label}</span>
        ))}
    </aside>
  )
}

/* ---------- coupon code ---------- */

/** `coupon-code`: the code in a <code> element (select-all on click, so it can be copied by hand). No script. */
export const CouponCodeElement: React.FC<P> = (p) => {
  const code = str(p.code).trim()
  if (!code) return null
  const label = str(p.label).trim()
  const note = str(p.note).trim()
  return (
    <div className="be-el-coupon">
      {label && <p className="be-el-coupon__label">{label}</p>}
      <p className="be-el-coupon__row">
        <code className="be-el-coupon__code">{code}</code>
      </p>
      {note && <p className="be-el-coupon__note">{note}</p>}
    </div>
  )
}

/** The wave-37 renderers, keyed by element type. Spread into ELEMENT_COMPONENTS in elementComponents.tsx. */
export const WAVE37_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'text-ticker': TextTickerElement,
  'reading-progress': ReadingProgressElement,
  'content-switcher': ContentSwitcherElement,
  tooltip: TooltipElement,
  hotspots: HotspotsElement,
  toc: TocElement,
  'sticky-bar': StickyBarElement,
  'coupon-code': CouponCodeElement,
}
