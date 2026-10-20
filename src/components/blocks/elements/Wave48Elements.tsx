/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { safeUrl } from '@/lib/mergeTags'

import { cells, flag, mediaOf, num, pick, str, type MediaRef } from './elementUtil'
import { EmbedConsentFrame } from './EmbedConsentFrame'
import './wave48.css'

/**
 * Wave 48 renderers (src/lib/elements/wave48Defs.ts): chart, embed, reviews and pagination. Server-safe, no client JS.
 * Charts are inline SVG with a visually hidden table of the same data. Motion is CSS only and sits inside a
 * prefers-reduced-motion: no-preference guard (wave48.css).
 */

type P = Record<string, unknown>

const ELLIPSIS = String.fromCodePoint(0x2026)
/** Used when a colour list has nothing usable in it. */
const DEFAULT_COLOR = '#2e3192'

/** A colour the SVG and CSS can take as-is: hex, rgb(...) or hsl(...). */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
const PALETTE = ['#2e3192', '#00a9ff', '#f5a623', '#2ecc71', '#e74c3c', '#8e44ad']
const START = -Math.PI / 2
const f2 = (n: number) => n.toFixed(2)
const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 })

/* ---------- chart ---------- */

const CHART_TYPES = ['bar', 'line', 'pie', 'radar', 'polar'] as const
type ChartType = (typeof CHART_TYPES)[number]
const CHART_NAME: Record<ChartType, string> = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart', radar: 'Radar chart', polar: 'Polar area chart' }
const MAX_POINTS = 12

type Point = { label: string; value: number }

/** "label | value" rows. Rows with no label or a value that is not a number are skipped. Negatives count as zero. */
function dataPoints(v: unknown): Point[] {
  const out: Point[] = []
  for (const [label = '', raw = ''] of cells(v, 2)) {
    const value = Number(raw.replace(/[,\s]/g, ''))
    if (label && raw.trim() !== '' && Number.isFinite(value)) out.push({ label, value: Math.max(0, value) })
    if (out.length === MAX_POINTS) break
  }
  return out
}

/** Comma-separated colours, invalid ones dropped. The list is reused in turn when there are more values. */
function palette(v: unknown): string[] {
  const list = str(v)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => COLOR_RE.test(s))
  return list.length ? list : PALETTE
}

/** Path for a pie or polar wedge from angle a0 to a1 (radians) around (cx, cy). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${f2(cx)} ${f2(cy)}L${f2(x0)} ${f2(y0)}A${f2(r)} ${f2(r)} 0 ${large} 1 ${f2(x1)} ${f2(y1)}Z`
}

/** Label anchor for a point at angle `cos` from the centre: text grows away from the middle. */
const anchorFor = (cos: number) => (cos > 0.2 ? 'start' : cos < -0.2 ? 'end' : 'middle')

type ColorAt = (i: number) => string

function barSvg(data: Point[], color: ColorAt, showValues: boolean, label: string): React.ReactNode {
  const W = 480
  const H = 280
  const PAD_T = 32
  const PAD_B = 56
  const PAD_X = 12
  const max = Math.max(...data.map((d) => d.value)) || 1
  const plotH = H - PAD_T - PAD_B
  const slot = (W - PAD_X * 2) / data.length
  const barW = Math.min(64, slot * 0.6)
  return (
    <svg className="be-el-48-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {data.map((d, i) => {
        const h = (d.value / max) * plotH
        const x = PAD_X + i * slot + (slot - barW) / 2
        const y = PAD_T + plotH - h
        const cx = x + barW / 2
        return (
          <g key={i}>
            <rect className="be-el-48-chart__bar" x={x} y={y} width={barW} height={h} rx={3} fill={color(i)} />
            {showValues && (
              <text x={cx} y={y - 6} textAnchor="middle" className="be-el-48-chart__value">
                {fmt(d.value)}
              </text>
            )}
            <text x={cx} y={H - PAD_B + 20} textAnchor="middle" className="be-el-48-chart__label">
              {d.label}
            </text>
          </g>
        )
      })}
      <line x1={PAD_X} x2={W - PAD_X} y1={PAD_T + plotH} y2={PAD_T + plotH} className="be-el-48-chart__axis" />
    </svg>
  )
}

function lineSvg(data: Point[], color: ColorAt, showValues: boolean, label: string): React.ReactNode {
  const W = 480
  const H = 280
  const PAD_T = 32
  const PAD_B = 56
  const PAD_X = 16
  const max = Math.max(...data.map((d) => d.value)) || 1
  const plotH = H - PAD_T - PAD_B
  const step = (W - PAD_X * 2) / data.length
  const pts = data.map((d, i) => ({ d, x: PAD_X + (i + 0.5) * step, y: PAD_T + plotH - (d.value / max) * plotH }))
  const ink = color(0)
  return (
    <svg className="be-el-48-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1={PAD_X} x2={W - PAD_X} y1={PAD_T + plotH} y2={PAD_T + plotH} className="be-el-48-chart__axis" />
      {pts.length > 1 && (
        <polyline className="be-el-48-chart__line" fill="none" stroke={ink} points={pts.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' ')} />
      )}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill={ink} />
          {showValues && (
            <text x={p.x} y={p.y - 10} textAnchor="middle" className="be-el-48-chart__value">
              {fmt(p.d.value)}
            </text>
          )}
          <text x={p.x} y={H - PAD_B + 20} textAnchor="middle" className="be-el-48-chart__label">
            {p.d.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function radarSvg(data: Point[], color: ColorAt, showValues: boolean, label: string): React.ReactNode {
  const W = 480
  const H = 300
  const CX = 240
  const CY = 150
  const R = 100
  const n = data.length
  const max = Math.max(...data.map((d) => d.value)) || 1
  const angle = (i: number) => START + (i * Math.PI * 2) / n
  const at = (i: number, frac: number): [number, number] => [CX + R * frac * Math.cos(angle(i)), CY + R * frac * Math.sin(angle(i))]
  const ring = (frac: number) => data.map((_, i) => at(i, frac).map(f2).join(',')).join(' ')
  const ink = color(0)
  return (
    <svg className="be-el-48-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} className="be-el-48-chart__grid" points={ring(f)} />
      ))}
      {data.map((_, i) => {
        const [x, y] = at(i, 1)
        return <line key={i} className="be-el-48-chart__spoke" x1={CX} y1={CY} x2={x} y2={y} />
      })}
      <polygon
        className="be-el-48-chart__area"
        fill={ink}
        stroke={ink}
        points={data.map((d, i) => at(i, d.value / max).map(f2).join(',')).join(' ')}
      />
      {data.map((d, i) => {
        const [lx, ly] = at(i, 1.16)
        const [px, py] = at(i, d.value / max)
        return (
          <g key={i}>
            <text x={lx} y={ly} textAnchor={anchorFor(Math.cos(angle(i)))} className="be-el-48-chart__label">
              {d.label}
            </text>
            {showValues && (
              <text x={px} y={py - 6} textAnchor="middle" className="be-el-48-chart__value">
                {fmt(d.value)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function polarSvg(data: Point[], color: ColorAt, showValues: boolean, label: string): React.ReactNode {
  const W = 480
  const H = 300
  const CX = 240
  const CY = 150
  const R = 110
  const max = Math.max(...data.map((d) => d.value)) || 1
  const slice = (Math.PI * 2) / data.length
  return (
    <svg className="be-el-48-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0.5, 1].map((f) => (
        <circle key={f} className="be-el-48-chart__grid" cx={CX} cy={CY} r={R * f} />
      ))}
      {data.map((d, i) => {
        // Radius grows with the square root of the value, so the wedge area is in proportion to it.
        const r = R * Math.sqrt(d.value / max)
        const a0 = START + i * slice
        const mid = a0 + slice / 2
        const lx = CX + (R + 16) * Math.cos(mid)
        const ly = CY + (R + 16) * Math.sin(mid)
        return (
          <g key={i}>
            {r > 0 &&
              (data.length === 1 ? (
                <circle cx={CX} cy={CY} r={r} fill={color(i)} />
              ) : (
                <path d={arcPath(CX, CY, r, a0, a0 + slice)} fill={color(i)} />
              ))}
            <text x={lx} y={ly} textAnchor={anchorFor(Math.cos(mid))} className="be-el-48-chart__label">
              {d.label}
            </text>
            {showValues && r > 0 && (
              <text x={CX + r * 0.6 * Math.cos(mid)} y={CY + r * 0.6 * Math.sin(mid)} textAnchor="middle" className="be-el-48-chart__value">
                {fmt(d.value)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function pieSvg(data: Point[], color: ColorAt, total: number, label: string): React.ReactNode {
  const C = 100
  const R = 96
  return (
    <svg className="be-el-48-chart__svg be-el-48-chart__svg--pie" viewBox="0 0 200 200" role="img" aria-label={label}>
      {data.map((d, i) => {
        const frac = d.value / total
        const before = data.slice(0, i).reduce((s, x) => s + x.value, 0)
        const a0 = START + (before / total) * Math.PI * 2
        const a1 = a0 + frac * Math.PI * 2
        return frac >= 0.9999 ? (
          <circle key={i} cx={C} cy={C} r={R} fill={color(i)} />
        ) : (
          <path key={i} d={arcPath(C, C, R, a0, a1)} fill={color(i)} />
        )
      })}
    </svg>
  )
}

/**
 * `chart`: bar, line, pie, radar or polar area in inline SVG. A legend (optional) and a visually hidden table
 * repeat the data for everyone who cannot see the drawing. Renders nothing when there is no data to plot.
 */
export const ChartElement: React.FC<P> = (p) => {
  const type = pick(p.chartType, CHART_TYPES, 'bar')
  const points = dataPoints(p.data).filter((d) => type !== 'pie' || d.value > 0)
  const total = points.reduce((s, d) => s + d.value, 0)
  if (points.length === 0 || (type === 'pie' && total <= 0)) return null

  const title = str(p.title).trim()
  const colors = palette(p.colors)
  const showLegend = flag(p.showLegend, false)
  const showValues = flag(p.showValues, true)
  const label = title || CHART_NAME[type]
  // Line and radar draw one series, so they use the first colour throughout.
  const color: ColorAt = (i) => (type === 'line' || type === 'radar' ? colors[0] ?? DEFAULT_COLOR : colors[i % colors.length] ?? DEFAULT_COLOR)
  const share = (d: Point) => Math.round((d.value / total) * 100)

  const svg =
    type === 'line'
      ? lineSvg(points, color, showValues, label)
      : type === 'radar'
        ? radarSvg(points, color, showValues, label)
        : type === 'polar'
          ? polarSvg(points, color, showValues, label)
          : type === 'pie'
            ? pieSvg(points, color, total, label)
            : barSvg(points, color, showValues, label)

  return (
    <figure className={`be-el-48-chart be-el-48-chart--${type}`}>
      {title && <figcaption className="be-el-48-chart__title">{title}</figcaption>}
      {svg}
      {showLegend && (
        <ul className="be-el-48-chart__legend" aria-hidden="true">
          {points.map((d, i) => (
            <li key={i}>
              <span className="be-el-48-chart__swatch" style={{ background: color(i) }} />
              {d.label}: {fmt(d.value)}
              {type === 'pie' && ` (${share(d)}%)`}
            </li>
          ))}
        </ul>
      )}
      <table className="be-el-48-sr">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Value</th>
            {type === 'pie' && <th scope="col">Share</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{fmt(d.value)}</td>
              {type === 'pie' && <td>{share(d)}%</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ---------- embed ---------- */

const EMBED_PROVIDERS = ['youtube', 'vimeo', 'x', 'instagram', 'facebook-video', 'google-calendar', 'typeform', 'custom-iframe'] as const
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number]
const EMBED_NAME: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  x: 'X',
  instagram: 'Instagram',
  'facebook-video': 'Facebook',
  'google-calendar': 'Google Calendar',
  typeform: 'Typeform',
  'custom-iframe': 'Embedded page',
}
const RATIO_CSS: Record<string, string> = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1' }

/** The only hosts an iframe is built on. The src always uses one of these, never the host the editor typed. */
const IFRAME_HOST = { youtube: 'www.youtube-nocookie.com', vimeo: 'player.vimeo.com', 'google-calendar': 'calendar.google.com', typeform: 'form.typeform.com' }
/** Hosts an address may come from, per provider. Link cards use the same rule for their own hosts. */
const HOSTS: Record<EmbedProvider, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'],
  vimeo: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  'facebook-video': ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
  'google-calendar': ['calendar.google.com'],
  typeform: ['form.typeform.com'],
  'custom-iframe': ['www.youtube-nocookie.com', 'youtube-nocookie.com', 'player.vimeo.com', 'calendar.google.com', 'form.typeform.com'],
}
const LINK_CARD: ReadonlySet<EmbedProvider> = new Set(['x', 'instagram', 'facebook-video'])
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms'

type EmbedTarget = { kind: 'iframe'; src: string } | { kind: 'link'; href: string } | { kind: 'error'; message: string }

function youtubeId(u: URL): string | null {
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null)
  if (u.hostname === 'youtu.be') return ok(u.pathname.slice(1).split('/')[0])
  if (u.pathname === '/watch') return ok(u.searchParams.get('v'))
  return ok(/^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(u.pathname)?.[1])
}

/** Works out what to show for an address. Null for an empty address (nothing renders). */
export function resolveEmbed(provider: EmbedProvider, raw: string): EmbedTarget | null {
  const text = raw.trim()
  if (!text) return null
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return { kind: 'error', message: 'This is not a valid web address.' }
  }
  if (u.protocol !== 'https:') return { kind: 'error', message: 'Use an https:// address.' }
  if (u.username || u.password) return { kind: 'error', message: 'This address is not allowed.' }
  const host = u.hostname.toLowerCase()
  const hostError: EmbedTarget = { kind: 'error', message: `This address is not from a host this embed allows for ${EMBED_NAME[provider]}.` }
  if (!HOSTS[provider].includes(host)) return hostError
  const noId: EmbedTarget = { kind: 'error', message: 'No video or page ID was found in this address.' }

  if (LINK_CARD.has(provider)) return { kind: 'link', href: u.toString() }
  switch (provider) {
    case 'youtube': {
      const id = youtubeId(u)
      return id ? { kind: 'iframe', src: `https://${IFRAME_HOST.youtube}/embed/${id}` } : noId
    }
    case 'vimeo': {
      const m = /(?:^|\/)(\d{5,12})(?:\/|$)/.exec(u.pathname)
      return m ? { kind: 'iframe', src: `https://${IFRAME_HOST.vimeo}/video/${m[1]}?dnt=1` } : noId
    }
    case 'google-calendar':
      return u.pathname.startsWith('/calendar/embed')
        ? { kind: 'iframe', src: `https://${IFRAME_HOST['google-calendar']}${u.pathname}${u.search}` }
        : { kind: 'error', message: 'Use a Google Calendar embed address (calendar/embed).' }
    case 'typeform':
      return u.pathname.startsWith('/to/')
        ? { kind: 'iframe', src: `https://${IFRAME_HOST.typeform}${u.pathname}${u.search}` }
        : { kind: 'error', message: 'Use a Typeform address that starts with /to/.' }
    default:
      // Custom iframe: the host is already on the allowlist, so the src is rebuilt from it.
      return { kind: 'iframe', src: `https://${host}${u.pathname}${u.search}` }
  }
}

/**
 * `embed`: an iframe from a fixed host allowlist (lazy, sandboxed, with a referrer policy), or a link card for X,
 * Instagram and Facebook. Anything else gets a plain message instead of an embed.
 */
export const EmbedElement: React.FC<P> = (p) => {
  const provider = pick(p.provider, EMBED_PROVIDERS, 'youtube')
  const target = resolveEmbed(provider, str(p.url))
  if (!target) return null
  if (target.kind === 'error') return <p className="be-el-48-embed__message">{target.message}</p>
  const name = EMBED_NAME[provider]
  const title = str(p.title).trim() || name
  if (target.kind === 'link') {
    return (
      <div className="be-el-48-embed be-el-48-embed--card">
        <a className="be-el-48-embed__card" href={target.href} target="_blank" rel="noopener noreferrer">
          <span className="be-el-48-embed__provider">{name}</span>
          <span className="be-el-48-embed__title">{title}</span>
          <span className="be-el-48-embed__cta">{`Open on ${name}`}</span>
        </a>
      </div>
    )
  }
  const ratio = pick(p.ratio, ['16:9', '4:3', '1:1'] as const, '16:9')
  // The iframe is only created after the visitor accepts marketing cookies (see EmbedConsentFrame).
  return (
    <EmbedConsentFrame
      src={target.src}
      title={title}
      providerName={name}
      aspectRatio={RATIO_CSS[ratio]}
      sandbox={SANDBOX}
      allow="encrypted-media; picture-in-picture"
    />
  )
}

/* ---------- reviews ---------- */

type Review = { name: string; rating: number | null; text: string; source: string; avatar: MediaRef | null }
type RatedReview = Review & { rating: number }

const REVIEW_LIMIT = 24
const STAR = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

/** Repeater rows as reviews. A rating is 1 to 5 (rounded); a row with none is shown without stars and left out of the average. */
function reviewsOf(v: unknown): Review[] {
  if (!Array.isArray(v)) return []
  const out: Review[] = []
  for (const row of v) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const raw = num(r.rating, NaN)
    const rating = Number.isNaN(raw) || raw < 1 ? null : Math.min(5, Math.round(raw))
    const name = str(r.name).trim()
    const body = str(r.text).trim()
    if (!name && !body && rating === null) continue
    out.push({ name, rating, text: body, source: str(r.source).trim(), avatar: mediaOf(r.avatar) })
    if (out.length === REVIEW_LIMIT) break
  }
  return out
}

/** Stars as one SVG with an accessible name such as "4 out of 5". Filled stars come from the wave48 CSS. */
const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <svg className="be-el-48-stars" viewBox="0 0 120 24" width="120" height="24" role="img" aria-label={`${rating} out of 5`}>
    {[0, 1, 2, 3, 4].map((i) => (
      <path key={i} d={STAR} transform={`translate(${i * 24} 0)`} className={i < rating ? 'be-el-48-stars__on' : 'be-el-48-stars__off'} />
    ))}
  </svg>
)

/**
 * schema.org Product with an AggregateRating and one Review per rated review. "<" is escaped so no review text can
 * end the script element early. The escape is built at run time so this source file holds no escape sequence.
 */
function reviewJsonLd(name: string, rated: RatedReview[], average: number): string {
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(average.toFixed(1)), reviewCount: rated.length, bestRating: 5, worstRating: 1 },
    review: rated.map((r) => ({
      '@type': 'Review',
      ...(r.name ? { author: { '@type': 'Person', name: r.name } } : {}),
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      ...(r.text ? { reviewBody: r.text } : {}),
    })),
  }
  return JSON.stringify(doc).split('<').join(String.fromCharCode(92) + 'u003c')
}

/**
 * `reviews`: rated reviews in a grid or a list. Stars are optional. The average is computed from the rated reviews, and
 * Review JSON-LD is added only when the option is on and the item has a name.
 */
export const ReviewsElement: React.FC<P> = (p) => {
  const reviews = reviewsOf(p.items)
  if (reviews.length === 0) return null
  const layout = pick(p.layout, ['grid', 'list'] as const, 'grid')
  const showStars = flag(p.showStars, true)
  const rated = reviews.filter((r): r is RatedReview => r.rating !== null)
  const average = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null
  const itemName = str(p.itemName).trim()

  return (
    <div className={`be-el-48-reviews be-el-48-reviews--${layout}`}>
      {average !== null && (
        <p className="be-el-48-reviews__summary">
          Average {average.toFixed(1)} out of 5 from {rated.length} {rated.length === 1 ? 'review' : 'reviews'}
        </p>
      )}
      <ul className="be-el-48-reviews__list">
        {reviews.map((r, i) => (
          <li key={i}>
            <article className="be-el-48-review">
              {showStars && r.rating !== null && <Stars rating={r.rating} />}
              {r.text && <p className="be-el-48-review__text">{r.text}</p>}
              <footer className="be-el-48-review__by">
                {r.avatar?.url && <img className="be-el-48-review__avatar" src={r.avatar.url} alt="" width={40} height={40} loading="lazy" />}
                <span>
                  {r.name && <strong className="be-el-48-review__name">{r.name}</strong>}
                  {r.name && r.source && ' '}
                  {r.source && <span className="be-el-48-review__source">{r.source}</span>}
                </span>
              </footer>
            </article>
          </li>
        ))}
      </ul>
      {flag(p.jsonLd, false) && itemName && average !== null && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: reviewJsonLd(itemName, rated, average) }} />
      )}
    </div>
  )
}

/* ---------- pagination ---------- */

const PAGE_TOKEN = '{page}'
const DEFAULT_PATTERN = '?page={page}'
const PAGINATION_ALIGN = ['left', 'centre', 'right'] as const

/**
 * Link for one page: the pattern with the token swapped for the integer. Only a safe result gives a link. A query
 * string on its own is allowed because safeUrl only takes absolute or root-relative addresses.
 */
function pageHref(pattern: string, n: number): string | null {
  const href = pattern.split(PAGE_TOKEN).join(String(n))
  if (href.startsWith('?')) return /^\?[^\s"'<>]*$/.test(href) ? href : null
  return safeUrl(href)
}

/**
 * Pages to show, with 'gap' where pages are left out. Keeps the first and last page and the pages near the current
 * one, and never shows more than `max` items. Each gap hides at least two pages.
 */
function pageItems(current: number, total: number, max: number): Array<number | 'gap'> {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1)
  const side = Math.floor((max - 5) / 2)
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
  if (current - side <= 3) return [...range(1, max - 2), 'gap', total]
  if (current + side >= total - 2) return [1, 'gap', ...range(total - max + 3, total)]
  return [1, 'gap', ...range(current - side, current + side), 'gap', total]
}

/**
 * `pagination`: previous and next links with numbered pages, in a navigation landmark. The current page has
 * aria-current. Links come only from the pattern with an integer page number, and nothing renders for one page.
 */
export const PaginationElement: React.FC<P> = (p) => {
  const total = Math.floor(num(p.total, 1, 1, 10000))
  if (total <= 1) return null
  const current = Math.floor(num(p.current, 1, 1, total))
  const max = Math.floor(num(p.maxLinks, 7, 5, 11))
  const raw = str(p.baseUrl).trim()
  const pattern = raw.includes(PAGE_TOKEN) ? raw : DEFAULT_PATTERN
  const align = pick(p.align, PAGINATION_ALIGN, 'centre')
  const prevLabel = str(p.prevLabel).trim() || 'Previous'
  const nextLabel = str(p.nextLabel).trim() || 'Next'
  const hasPrev = current > 1
  const hasNext = current < total

  /** A link when there is a safe href, otherwise plain text so no unsafe address is ever written. */
  const item = (href: string | null, text: React.ReactNode, className: string, extra: Record<string, string> = {}) =>
    href ? (
      <a className={className} href={href} {...extra}>
        {text}
      </a>
    ) : (
      <span className={className} {...extra}>
        {text}
      </span>
    )
  const base = 'be-el-48-pagination__item'

  return (
    <nav className={`be-el-48-pagination be-el-48-pagination--${align}`} aria-label="Pagination">
      <ul className="be-el-48-pagination__list">
        <li>
          {hasPrev
            ? item(pageHref(pattern, current - 1), prevLabel, base, { rel: 'prev' })
            : item(null, prevLabel, `${base} ${base}--disabled`, { 'aria-disabled': 'true' })}
        </li>
        {pageItems(current, total, max).map((it, i) => (
          <li key={i}>
            {it === 'gap' ? (
              <span className="be-el-48-pagination__gap" aria-hidden="true">
                {ELLIPSIS}
              </span>
            ) : it === current ? (
              <span className={`${base} ${base}--current`} aria-current="page">
                {it}
              </span>
            ) : (
              item(pageHref(pattern, it), it, base, { 'aria-label': `Page ${it}` })
            )}
          </li>
        ))}
        <li>
          {hasNext
            ? item(pageHref(pattern, current + 1), nextLabel, base, { rel: 'next' })
            : item(null, nextLabel, `${base} ${base}--disabled`, { 'aria-disabled': 'true' })}
        </li>
      </ul>
    </nav>
  )
}

/** Components for the wave-48 elements, keyed by elementType. Spread into ELEMENT_COMPONENTS. */
export const WAVE48_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  chart: ChartElement,
  embed: EmbedElement,
  reviews: ReviewsElement,
  pagination: PaginationElement,
}
