'use client'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { linkHref, mediaOf, num, str } from './elementUtil'
import './wave65.css'

/** Wave 65 client elements: business-hours and slides (defs: src/lib/elements/wave65Defs.ts). */

type P = Record<string, unknown>
export type HoursRow = { day: string; open: string; close: string; closed: boolean }

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/

export const parseTime = (v: string): number | null => {
  const m = TIME.exec(v.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Weekday key and minutes since midnight for an instant, in an IANA zone (or the local zone when empty/invalid). */
export function zonedParts(now: Date, tz?: string): { day: (typeof DAY_KEYS)[number]; minutes: number } {
  const get = (zone?: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(zone ? { timeZone: zone } : {}) }).formatToParts(now)
    const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
    return { day: p('weekday').slice(0, 3).toLowerCase(), minutes: (Number(p('hour')) % 24) * 60 + Number(p('minute')) }
  }
  let r: { day: string; minutes: number }
  try { r = get(tz || undefined) } catch { r = get() }
  return { day: (DAY_KEYS as readonly string[]).includes(r.day) ? (r.day as (typeof DAY_KEYS)[number]) : 'mon', minutes: r.minutes }
}

export function hoursRows(v: unknown): HoursRow[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 14).map((r) => {
    const o = (r && typeof r === 'object' ? r : {}) as P
    const day = (DAY_KEYS as readonly string[]).includes(str(o.day)) ? str(o.day) : 'mon'
    return { day, open: str(o.open), close: str(o.close), closed: o.closed === true }
  })
}

/** True when a row for today covers the current time. Overnight spans (close before open) run past midnight. */
export function isOpenNow(rows: HoursRow[], now: Date, tz?: string): boolean {
  const { day, minutes } = zonedParts(now, tz)
  const prev = DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7]
  return rows.some((r) => {
    if (r.closed) return false
    const o = parseTime(r.open), c = parseTime(r.close)
    if (o === null || c === null) return false
    if (r.day === day) return o <= c ? minutes >= o && minutes < c : minutes >= o
    return r.day === prev && c < o && minutes < c
  })
}

const noopSubscribe = (): (() => void) => () => undefined
const REDUCED = '(prefers-reduced-motion: reduce)'
const subscribeReduced = (cb: () => void): (() => void) => {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function BusinessHoursElement(props: P): React.ReactElement | null {
  const rows = hoursRows(props.rows)
  const tz = str(props.timezone).trim()
  const minute = useSyncExternalStore(noopSubscribe, () => Math.floor(Date.now() / 60000), () => 0)
  const now = minute ? new Date(minute * 60000) : null
  if (!rows.length) return null
  const today = now ? zonedParts(now, tz).day : ''
  const open = now ? isOpenNow(rows, now, tz) : false
  return (
    <div className="be-el-65-hours">
      {str(props.title) ? <h3 className="be-el-65-hours__title">{str(props.title)}</h3> : null}
      <table className="be-el-65-hours__table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.day === today ? 'is-today' : undefined} aria-current={r.day === today ? 'date' : undefined}>
              <th scope="row">{DAY_NAMES[r.day]}</th>
              <td>{r.closed || !r.open || !r.close ? 'Closed' : `${r.open} - ${r.close}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {now && props.showStatus !== false ? <p className={`be-el-65-hours__status${open ? ' is-open' : ''}`}>{open ? 'Open now' : 'Closed now'}{tz ? ` (${tz})` : ''}</p> : null}
    </div>
  )
}

/** Wrap-around slide index. */
export const nextIndex = (i: number, count: number, step: number): number => (count <= 0 ? 0 : (((i + step) % count) + count) % count)

type Slide = { heading: string; text: string; label: string; href: string; image: string; alt: string }
const slidesOf = (v: unknown): Slide[] =>
  (Array.isArray(v) ? v : []).slice(0, 6).map((s) => {
    const o = (s && typeof s === 'object' ? s : {}) as P
    const m = mediaOf(o.image) ?? mediaOf(o.imageUrl)
    return { heading: str(o.heading), text: str(o.text), label: str(o.buttonLabel), href: linkHref(o.buttonUrl), image: m?.url ?? '', alt: m?.alt ?? '' }
  })

export function SlidesElement(props: P): React.ReactElement | null {
  const slides = slidesOf(props.items)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => true)
  const root = useRef<HTMLDivElement>(null)
  const count = slides.length
  const auto = props.autoplay === true && !paused && !reduced && count > 1
  const seconds = num(props.interval, 6, 2, 30)
  useEffect(() => {
    if (!auto) return undefined
    const t = window.setInterval(() => setIndex((i) => nextIndex(i, count, 1)), seconds * 1000)
    return () => window.clearInterval(t)
  }, [auto, count, seconds])
  if (count < 1) return null
  const go = (step: number) => setIndex((i) => nextIndex(i, count, step))
  return (
    <div
      ref={root} className="be-el-65-slides" role="region" aria-roledescription="carousel" aria-label="Slides" tabIndex={0}
      style={{ minHeight: num(props.height, 420, 200, 1000) }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1) }}
    >
      {slides.map((s, i) => (
        <div key={i} className={`be-el-65-slides__slide${i === index ? ' is-active' : ''}`} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} aria-hidden={i === index ? undefined : true}
          style={s.image ? { backgroundImage: `url("${s.image.replace(/"/g, '%22')}")` } : undefined}>
          <div className="be-el-65-slides__body">
            {s.heading ? <h2>{s.heading}</h2> : null}
            {s.text ? <p>{s.text}</p> : null}
            {s.label && s.href ? <a className="be-el-65-slides__btn" href={s.href} tabIndex={i === index ? 0 : -1}>{s.label}</a> : null}
          </div>
        </div>
      ))}
      {count > 1 ? (
        <>
          <button type="button" className="be-el-65-slides__nav is-prev" aria-label="Previous slide" onClick={() => go(-1)}>{String.fromCodePoint(0x2039)}</button>
          <button type="button" className="be-el-65-slides__nav is-next" aria-label="Next slide" onClick={() => go(1)}>{String.fromCodePoint(0x203a)}</button>
          <div className="be-el-65-slides__dots">
            {slides.map((_, i) => <button key={i} type="button" aria-label={`Go to slide ${i + 1}`} aria-current={i === index ? 'true' : undefined} onClick={() => setIndex(i)} />)}
          </div>
        </>
      ) : null}
    </div>
  )
}

export const WAVE65_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  'business-hours': BusinessHoursElement,
  slides: SlidesElement,
}
