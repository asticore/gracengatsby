import React, { useId } from 'react'

import { safeUrl } from '@/lib/mergeTags'

import { SocialGlyph } from './icons'
import { alignClass } from './TextElements'
import { cells, flag, num, pick, str } from './elementUtil'

type P = Record<string, unknown>

/** Shared by `accordion` (one open at a time, via the shared name) and `toggle` (each item independent). */
const Disclosure: React.FC<{ p: P; exclusive: boolean }> = ({ p, exclusive }) => {
  const group = useId()
  const rows = cells(p.items, 2)
  const openFirst = flag(p.openFirst)
  return (
    <div className={`el-disclosure ${exclusive ? 'el-disclosure--accordion' : 'el-disclosure--toggle'}`}>
      {rows.map(([title, body], i) => (
        <details key={i} name={exclusive ? group : undefined} open={openFirst && i === 0}>
          <summary>{title}</summary>
          <div className="el-disclosure__body">{body}</div>
        </details>
      ))}
    </div>
  )
}

export const AccordionElement: React.FC<P> = (p) => <Disclosure p={p} exclusive />
export const ToggleElement: React.FC<P> = (p) => <Disclosure p={p} exclusive={false} />

const MAX_TABS = 8

/** `tabs`: CSS-only. Hidden radio inputs hold the selected tab; labels are the tab buttons. Up to 8 tabs. */
export const TabsElement: React.FC<P> = (p) => {
  const id = useId()
  const rows = cells(p.items, 2).slice(0, MAX_TABS)
  if (rows.length === 0) return null
  return (
    <div className="el-tabs">
      {rows.map((_, i) => (
        <input key={i} type="radio" name={id} id={`${id}-${i}`} className="el-tabs__radio" defaultChecked={i === 0} aria-label={rows[i][0]} />
      ))}
      <div className="el-tabs__nav">
        {rows.map(([title], i) => (
          <label key={i} htmlFor={`${id}-${i}`}>
            {title}
          </label>
        ))}
      </div>
      <div className="el-tabs__panels">
        {rows.map(([, body], i) => (
          <div className="el-tabs__panel" key={i}>
            {body}
          </div>
        ))}
      </div>
    </div>
  )
}

/** `counter`: a large static figure with prefix, suffix and a title. Not animated. */
export const CounterElement: React.FC<P> = (p) => {
  const value = num(p.number, 0)
  const decimals = Math.round(num(p.decimals, 0, 0, 4))
  const shown = value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: flag(p.separator, true) })
  return (
    <div className={`el-counter ${alignClass(p.align ?? 'center')}`}>
      <div className="el-counter__number">
        {str(p.prefix) && <span>{str(p.prefix)}</span>}
        {shown}
        {str(p.suffix) && <span>{str(p.suffix)}</span>}
      </div>
      {str(p.title) && <div className="el-counter__title">{str(p.title)}</div>}
    </div>
  )
}

/** `progress-bar`: a labelled bar with an accessible progressbar role. */
export const ProgressBarElement: React.FC<P> = (p) => {
  const pct = num(p.percent, 70, 0, 100)
  const title = str(p.title, 'Progress')
  return (
    <div className="el-progress">
      <div className="el-progress__head">
        <span>{title}</span>
        {flag(p.showPercent, true) && <span>{Math.round(pct)}%</span>}
      </div>
      <div className="el-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={title}>
        <div className="el-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const STAR = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'
const Stars: React.FC<{ count: number; filled?: boolean }> = ({ count, filled }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <svg key={i} width="1em" height="1em" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={STAR} />
      </svg>
    ))}
  </>
)

/** Exported so testimonials can show the same stars. */
export const StarsRow: React.FC<{ rating: number; max?: number; label?: string }> = ({ rating, max = 5, label }) => {
  const m = Math.round(Math.min(Math.max(max, 1), 10))
  const r = Math.min(Math.max(rating, 0), m)
  return (
    <span className="el-stars" role="img" aria-label={label || `${r} out of ${m} stars`}>
      <span className="el-stars__base">
        <Stars count={m} />
      </span>
      <span className="el-stars__fill" style={{ width: `${(r / m) * 100}%` }}>
        <Stars count={m} filled />
      </span>
    </span>
  )
}

/** `star-rating`: 0 to `scale` stars, halves allowed. */
export const StarRatingElement: React.FC<P> = (p) => {
  const max = Math.round(num(p.scale, 5, 1, 10))
  const rating = num(p.rating, 4.5, 0, max)
  return (
    <div className={`el-rating ${alignClass(p.align)}`}>
      <StarsRow rating={rating} max={max} />
      {str(p.title) && <span className="el-rating__title">{str(p.title)}</span>}
    </div>
  )
}

/** `alert`: a coloured notice box. */
export const AlertElement: React.FC<P> = (p) => {
  const kind = pick(p.kind, ['info', 'success', 'warning', 'danger'] as const, 'info')
  return (
    <div className={`el-alert el-alert--${kind}`} role={kind === 'danger' ? 'alert' : 'note'}>
      {str(p.title) && <strong className="el-alert__title">{str(p.title)}</strong>}
      {str(p.text) && <p>{str(p.text)}</p>}
    </div>
  )
}

/** `social-icons`: one line per link as "network | url". */
export const SocialIconsElement: React.FC<P> = (p) => {
  const rows = cells(p.items, 2)
  const shape = pick(p.shape, ['circle', 'square', 'plain'] as const, 'circle')
  const size = num(p.size, 20, 12, 48)
  return (
    <ul className={`el-social el-social--${shape} ${alignClass(p.align)}`}>
      {rows.map(([network, url], i) => {
        const key = network.toLowerCase()
        const href = safeUrl(key === 'email' && url && !/^mailto:/i.test(url) && !url.includes(':') ? `mailto:${url}` : url)
        if (!href) return null
        return (
          <li key={i}>
            <a href={href} aria-label={network} rel="noopener noreferrer" target={href.startsWith('http') ? '_blank' : undefined}>
              <SocialGlyph network={key} size={size} />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
