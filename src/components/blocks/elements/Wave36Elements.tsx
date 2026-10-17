/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { safeUrl } from '@/lib/mergeTags'

import { Icon, SocialGlyph } from './icons'
import { alignClass } from './TextElements'
import { cells, flag, iconName, linkHref, lines, mediaOf, num, pick, ratioCss, str } from './elementUtil'
import './wave36.css'

/**
 * Wave 36 renderers: server components by default (no client JS). Motion and interaction are CSS only (see
 * wave36.css); charts are inline SVG. Defs live in src/lib/elements/wave36Defs.ts.
 */

type P = Record<string, unknown>
type Style = React.CSSProperties

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
type HeadingLevel = (typeof HEADING_TAGS)[number]
const headingTag = (v: unknown, fallback: HeadingLevel = 'h2'): HeadingLevel => pick(v, HEADING_TAGS, fallback)

/** A heading at the chosen level. Written out per level so each one is a static element, not a tag picked during render. */
const Heading: React.FC<{ level: HeadingLevel; className?: string; style?: Style; children?: React.ReactNode }> = ({ level, ...rest }) => {
  switch (level) {
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
    default:
      return <h2 {...rest} />
  }
}

/** A colour the CSS can take as-is: hex, rgb(...) or hsl(...). Anything else falls back. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
const colorOf = (v: unknown, fallback: string): string => {
  const s = str(v).trim()
  return COLOR_RE.test(s) ? s : fallback
}

/** Repeater rows as objects with the given string keys. A textarea (one row per line, "|" between keys) works too. */
function records(v: unknown, keys: string[]): Record<string, string>[] {
  if (Array.isArray(v)) {
    return v
      .map((row) => {
        const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
        return Object.fromEntries(keys.map((k) => [k, str(r[k]).trim()])) as Record<string, string>
      })
      .filter((o) => keys.some((k) => o[k]))
  }
  return cells(v, keys.length).map((c) => Object.fromEntries(keys.map((k, i) => [k, (c[i] ?? '').trim()])) as Record<string, string>)
}

/** Text that is hidden on screen but still read by screen readers and crawlers. */
const VisuallyHidden: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="be-el-visually-hidden">{children}</span>

/* ---------- table ---------- */

/** `table`: a real table with an optional header row, stripes and caption. Wrapped so wide tables scroll sideways. */
export const TableElement: React.FC<P> = (p) => {
  const rows = cells(p.rows, 6)
  if (rows.length === 0) return null
  const width = Math.max(...rows.map((r) => r.length))
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '')
  const headerRow = flag(p.headerRow, true)
  const head = headerRow ? pad(rows[0]) : null
  const body = (headerRow ? rows.slice(1) : rows).map(pad)
  const caption = str(p.caption).trim()
  const striped = flag(p.striped, false)
  return (
    <div className="be-el-table-wrap" role="region" aria-label={caption || 'Table'} tabIndex={0}>
      <table className={striped ? 'be-el-table be-el-table--striped' : 'be-el-table'}>
        {caption && <caption>{caption}</caption>}
        {head && (
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- timeline ---------- */

const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/

/** `timeline`: an ordered list of dated events with a line down the side. Dates in ISO form get a datetime attribute. */
export const TimelineElement: React.FC<P> = (p) => {
  const items = records(p.items, ['date', 'title', 'text']).filter((r) => r.date || r.title || r.text)
  if (items.length === 0) return null
  const level = headingTag(p.tag, 'h3')
  const center = pick(p.align, ['left', 'center'] as const, 'left')
  return (
    <ol className={`be-el-timeline be-el-timeline--${center}`}>
      {items.map((r, i) => (
        <li key={i} className="be-el-timeline__item">
          {r.date && (
            <time className="be-el-timeline__date" dateTime={ISO_DATE.test(r.date) ? r.date : undefined}>
              {r.date}
            </time>
          )}
          {r.title && <Heading level={level} className="be-el-timeline__title">{r.title}</Heading>}
          {r.text && <p className="be-el-timeline__text">{r.text}</p>}
        </li>
      ))}
    </ol>
  )
}

/* ---------- breadcrumbs ---------- */

/** Full http(s) addresses only: search engines need absolute item URLs in structured data. */
const absoluteUrl = (v: unknown): string => {
  const h = safeUrl(v)
  return h && /^https?:\/\//i.test(h) ? h : ''
}

/** `breadcrumbs`: a labelled nav trail plus BreadcrumbList JSON-LD built from the same items. */
export const BreadcrumbsElement: React.FC<P> = (p) => {
  const items = records(p.items, ['label', 'url']).filter((r) => r.label)
  if (items.length === 0) return null
  const sep = pick(p.separator, ['/', '>', '-'] as const, '/')
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((r, i) => {
      const item = absoluteUrl(r.url)
      return { '@type': 'ListItem', position: i + 1, name: r.label, ...(item ? { item } : {}) }
    }),
  }
  // "<" is escaped so a label such as "</script>" cannot end the script element early.
  const json = JSON.stringify(ld).replace(/</g, '\\u003c')
  return (
    <>
      <nav className="be-el-crumbs" aria-label="Breadcrumb">
        <ol className="be-el-crumbs__list">
          {items.map((r, i) => {
            const last = i === items.length - 1
            const href = linkHref(r.url)
            return (
              <li key={i} className="be-el-crumbs__item">
                {i > 0 && (
                  <span className="be-el-crumbs__sep" aria-hidden="true">
                    {sep}
                  </span>
                )}
                {href && !last ? <a href={href}>{r.label}</a> : <span aria-current={last ? 'page' : undefined}>{r.label}</span>}
              </li>
            )
          })}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    </>
  )
}

/* ---------- back to top ---------- */

/** `back-to-top`: a link to #top styled as a button. Inline in the flow, or fixed to the bottom-right corner. No JS. */
export const BackToTopElement: React.FC<P> = (p) => {
  const label = str(p.label).trim() || 'Back to top'
  const name = iconName(p.icon) || 'arrow'
  const fixed = pick(p.position, ['inline', 'fixed-corner'] as const, 'inline') === 'fixed-corner'
  const link = (
    <a href="#top" className={fixed ? 'be-el-btt be-el-btt--fixed' : 'be-el-btt'}>
      <Icon name={name} size={18} className="be-el-btt__icon" />
      <span>{label}</span>
    </a>
  )
  if (fixed) return link
  return <div className={`be-el-btt-wrap ${alignClass(p.align)}`}>{link}</div>
}

/* ---------- two-tone heading ---------- */

/** `dual-heading`: one heading element; the second part sits in a span with its own colour. */
export const DualHeadingElement: React.FC<P> = (p) => {
  const first = str(p.first).trim()
  const second = str(p.second).trim()
  if (!first && !second) return null
  const c = colorOf(p.color, '')
  return (
    <Heading level={headingTag(p.tag)} className={`be-el-dual ${alignClass(p.align)}`}>
      {first}
      {first && second ? ' ' : null}
      {second && (
        <span className="be-el-dual__second" style={c ? { color: c } : undefined}>
          {second}
        </span>
      )}
    </Heading>
  )
}

/* ---------- rotating headline ---------- */

/**
 * `animated-headline`: every word is in the markup. The visible rotation is CSS only: the track's registered
 * --be-el-p number runs from 0 to the word count, and each word's opacity (and, for "slide", its offset) follows
 * its distance from that number. Reduced motion keeps the first word still.
 */
export const AnimatedHeadlineElement: React.FC<P> = (p) => {
  const words = lines(p.words)
  if (words.length === 0) return null
  const style = pick(p.style, ['fade', 'slide'] as const, 'fade')
  const before = str(p.before).trim()
  const after = str(p.after).trim()
  const n = words.length
  return (
    <Heading level={headingTag(p.tag, 'h1')} className={`be-el-rotor be-el-rotor--${style}`}>
      {before && `${before} `}
      <span className="be-el-rotor__track" aria-hidden="true" style={{ '--be-el-n': n } as Style}>
        {words.map((w, i) => (
          <span key={i} className="be-el-rotor__word" style={{ '--be-el-i': i } as Style}>
            {w}
          </span>
        ))}
      </span>
      <VisuallyHidden>{[before, words.join(', '), after].filter(Boolean).join(' ')}</VisuallyHidden>
      {after && ` ${after}`}
    </Heading>
  )
}

/* ---------- circle progress ---------- */

/** `circle-progress`: a ring filled to a percentage, with the value in the middle. Pure SVG. */
export const CircleProgressElement: React.FC<P> = (p) => {
  const pct = num(p.percent, 70, 0, 100)
  const rounded = Math.round(pct)
  const size = Math.round(num(p.size, 160, 60, 300))
  const thickness = num(p.thickness, 12, 2, 40)
  const label = str(p.label).trim()
  const stroke = colorOf(p.color, '#2e3192')
  // The ring is drawn in a 100 x 100 viewBox, so the stroke width is scaled from pixels to that box.
  const sw = (thickness * 100) / size
  const r = 50 - sw / 2
  return (
    <div className="be-el-circle" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded} aria-label={label || 'Progress'} style={{ width: size, height: size }}>
      <svg className="be-el-circle__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="be-el-circle__track" cx="50" cy="50" r={r} strokeWidth={sw} />
        <circle className="be-el-circle__bar" cx="50" cy="50" r={r} strokeWidth={sw} pathLength={100} strokeDasharray={`${rounded} 100`} style={{ stroke }} />
      </svg>
      <span className="be-el-circle__value">{rounded}%</span>
      {label && <span className="be-el-circle__label">{label}</span>}
    </div>
  )
}

/* ---------- charts ---------- */

type Point = { label: string; value: number }
const PALETTE = ['#2e3192', '#00a9ff', '#f5a623', '#2ecc71', '#e74c3c', '#8e44ad']

/** "label | value" rows. Non-numeric values are dropped, negatives count as zero, at most 12 rows. */
function dataPoints(v: unknown): Point[] {
  const out: Point[] = []
  for (const [label = '', raw = ''] of cells(v, 2)) {
    const value = Number(raw.replace(/[,\s]/g, ''))
    if (label && raw.trim() !== '' && Number.isFinite(value)) out.push({ label, value: Math.max(0, value) })
  }
  return out.slice(0, 12)
}

/** Comma-separated colours, invalid ones dropped. The list is reused in turn when there are more values. */
function palette(v: unknown): string[] {
  const list = str(v)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => COLOR_RE.test(s))
  return list.length ? list : PALETTE
}

const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 })

/** `bar-chart`: vertical bars in inline SVG, with a visually hidden table of the same data. */
export const BarChartElement: React.FC<P> = (p) => {
  const data = dataPoints(p.data)
  if (data.length === 0) return null
  const title = str(p.title).trim()
  const colors = palette(p.colors)
  const showValues = flag(p.showValues, true)
  const W = 480
  const H = 280
  const PAD_T = 32
  const PAD_B = 56
  const PAD_X = 12
  const max = Math.max(...data.map((d) => d.value)) || 1
  const plotH = H - PAD_T - PAD_B
  const plotW = W - PAD_X * 2
  const slot = plotW / data.length
  const barW = Math.min(64, slot * 0.6)
  return (
    <figure className="be-el-chart">
      {title && <figcaption className="be-el-chart__title">{title}</figcaption>}
      <svg className="be-el-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title || 'Bar chart'}>
        {data.map((d, i) => {
          const h = (d.value / max) * plotH
          const x = PAD_X + i * slot + (slot - barW) / 2
          const y = PAD_T + plotH - h
          const cx = x + barW / 2
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx={3} fill={colors[i % colors.length]} />
              {showValues && (
                <text x={cx} y={y - 6} textAnchor="middle" className="be-el-chart__value">
                  {fmt(d.value)}
                </text>
              )}
              <text x={cx} y={H - PAD_B + 20} textAnchor="middle" className="be-el-chart__label">
                {d.label}
              </text>
            </g>
          )
        })}
        <line x1={PAD_X} x2={W - PAD_X} y1={PAD_T + plotH} y2={PAD_T + plotH} className="be-el-chart__axis" />
      </svg>
      <table className="be-el-visually-hidden">
        <caption>{title || 'Bar chart data'}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{fmt(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${cx} ${cy}L${x0.toFixed(3)} ${y0.toFixed(3)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}Z`
}

/** `pie-chart`: slices as SVG arc paths (no JS), a visible legend and a visually hidden table of the same data. */
export const PieChartElement: React.FC<P> = (p) => {
  const data = dataPoints(p.data).filter((d) => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)
  if (data.length === 0 || total <= 0) return null
  const title = str(p.title).trim()
  const colors = palette(p.colors)
  const C = 100
  const R = 96
  // Slices run clockwise from 12 o'clock. Each start angle is the share of everything before it.
  const slices = data.map((d, i) => {
    const frac = d.value / total
    const before = data.slice(0, i).reduce((s, x) => s + x.value, 0)
    const a0 = -Math.PI / 2 + (before / total) * Math.PI * 2
    return { ...d, frac, color: colors[i % colors.length], a0, a1: a0 + frac * Math.PI * 2 }
  })
  return (
    <figure className="be-el-chart be-el-chart--pie">
      {title && <figcaption className="be-el-chart__title">{title}</figcaption>}
      <div className="be-el-pie__body">
        <svg className="be-el-pie__svg" viewBox="0 0 200 200" role="img" aria-label={title || 'Pie chart'}>
          {slices.map((s, i) =>
            s.frac >= 0.9999 ? (
              <circle key={i} cx={C} cy={C} r={R} fill={s.color} />
            ) : (
              <path key={i} d={arcPath(C, C, R, s.a0, s.a1)} fill={s.color} />
            ),
          )}
        </svg>
        <ul className="be-el-pie__legend">
          {slices.map((s, i) => (
            <li key={i}>
              <span className="be-el-pie__swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}: {fmt(s.value)} ({Math.round(s.frac * 100)}%)
            </li>
          ))}
        </ul>
      </div>
      <table className="be-el-visually-hidden">
        <caption>{title || 'Pie chart data'}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Value</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s, i) => (
            <tr key={i}>
              <th scope="row">{s.label}</th>
              <td>{fmt(s.value)}</td>
              <td>{Math.round(s.frac * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ---------- share buttons ---------- */

const NETWORKS = [
  { key: 'facebook', label: 'Facebook', glyph: 'facebook' },
  { key: 'x', label: 'X', glyph: 'x' },
  { key: 'linkedin', label: 'LinkedIn', glyph: 'linkedin' },
  { key: 'whatsapp', label: 'WhatsApp', glyph: '' },
  { key: 'email', label: 'Email', glyph: 'email' },
] as const

const enc = (params: Record<string, string>): string =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')

/**
 * The share link for one network. Facebook and LinkedIn only work with a page address, so they return '' when
 * none is set; X, WhatsApp and email fall back to the title alone.
 */
function shareHref(key: string, url: string, title: string): string {
  switch (key) {
    case 'facebook':
      return url ? `https://www.facebook.com/sharer/sharer.php?${enc({ u: url })}` : ''
    case 'x':
      return `https://x.com/intent/post?${enc({ text: title, url })}`
    case 'linkedin':
      return url ? `https://www.linkedin.com/sharing/share-offsite/?${enc({ url })}` : ''
    case 'whatsapp':
      return `https://wa.me/?${enc({ text: url ? `${title} ${url}`.trim() : title })}`
    case 'email':
      return `mailto:?${enc({ subject: title, body: url || title })}`
    default:
      return ''
  }
}

/** `share-buttons`: real links to each network's share page. Opens in a new tab, except email. */
export const ShareButtonsElement: React.FC<P> = (p) => {
  const url = (() => {
    const h = safeUrl(p.shareUrl)
    return h && /^https?:\/\//i.test(h) ? h : ''
  })()
  const title = str(p.title).trim()
  const style = pick(p.style, ['buttons', 'icons'] as const, 'buttons')
  const align = pick(p.align, ['left', 'center', 'right'] as const, 'left')
  const links = NETWORKS.filter((n) => flag(p[n.key])).map((n) => ({ ...n, href: shareHref(n.key, url, title) })).filter((n) => n.href)
  if (links.length === 0) return null
  return (
    <ul className={`be-el-share be-el-share--${style} be-el-share--${align}`}>
      {links.map((n) => {
        const glyph = n.glyph ? <SocialGlyph network={n.glyph} size={style === 'icons' ? 20 : 18} /> : null
        const isEmail = n.key === 'email'
        return (
          <li key={n.key}>
            <a
              className="be-el-share__link"
              href={n.href}
              target={isEmail ? undefined : '_blank'}
              rel={isEmail ? undefined : 'noopener noreferrer'}
              aria-label={`Share on ${n.label}${isEmail ? '' : ' (opens in a new tab)'}`}
            >
              {glyph}
              <span className={glyph && style === 'icons' ? 'be-el-visually-hidden' : undefined}>{n.label}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/* ---------- before and after ---------- */

type Pic = { url: string; alt: string }

/** A media prop (resolved object) or a pasted address, plus alt text. Null when neither is set. */
const picOf = (media: unknown, url: unknown, alt: unknown): Pic | null => {
  const m = mediaOf(media)
  const src = m?.url || safeUrl(url)
  if (!src) return null
  return { url: src, alt: str(alt).trim() || m?.alt || '' }
}

/**
 * `image-comparison`: two pictures stacked. The "before" picture sits in a box that is half the width and
 * resizable from its right edge (CSS resize), so readers drag the divider. The overlay's image is sized in
 * container query units so it keeps the full frame width while the box shrinks. Keyboard users cannot drag it;
 * both pictures are in the page for them with their alt text.
 */
export const ImageComparisonElement: React.FC<P> = (p) => {
  const before = picOf(p.before, p.beforeUrl, p.beforeAlt)
  const after = picOf(p.after, p.afterUrl, p.afterAlt)
  if (!before || !after) {
    return <div className="be-el-compare-empty">Choose a before and an after picture.</div>
  }
  const beforeLabel = str(p.beforeLabel).trim()
  const afterLabel = str(p.afterLabel).trim()
  // Both pictures are absolutely placed, so the frame needs a real ratio ("auto" would collapse it to zero height).
  const ratio = ratioCss(p.ratio)
  return (
    <figure className="be-el-compare" style={{ aspectRatio: ratio === 'auto' ? '16 / 9' : ratio }}>
      <img className="be-el-compare__img" src={after.url} alt={after.alt} loading="lazy" decoding="async" />
      <div className="be-el-compare__before">
        <img className="be-el-compare__img" src={before.url} alt={before.alt} loading="lazy" decoding="async" />
      </div>
      {beforeLabel && <span className="be-el-compare__label be-el-compare__label--before">{beforeLabel}</span>}
      {afterLabel && <span className="be-el-compare__label be-el-compare__label--after">{afterLabel}</span>}
    </figure>
  )
}
