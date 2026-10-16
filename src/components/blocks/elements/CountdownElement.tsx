'use client'

import React, { useEffect, useState } from 'react'

import { num, str } from './elementUtil'

const pad = (n: number) => String(n).padStart(2, '0')

/** Splits a number of milliseconds into days/hours/minutes/seconds (never negative). Exported for tests. */
export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}

/**
 * `countdown`: ticks down to a date. The server and the first client render both show the
 * placeholder dashes, so there is no hydration mismatch; the clock starts after mount.
 */
export const CountdownElement: React.FC<Record<string, unknown>> = (p) => {
  const target = Date.parse(str(p.target))
  const valid = Number.isFinite(target)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [])
  if (!valid) return <div className="el-countdown el-countdown--empty">Set a date and time for the countdown.</div>
  const left = now === null ? null : target - now
  if (left !== null && left <= 0) return <div className="el-countdown el-countdown--done">{str(p.expiredText, 'This offer has ended.')}</div>
  const t = left === null ? null : splitDuration(left)
  const parts: Array<[string, string]> = [
    [t ? String(t.d) : '--', str(p.daysLabel, 'Days')],
    [t ? pad(t.h) : '--', str(p.hoursLabel, 'Hours')],
    [t ? pad(t.m) : '--', str(p.minutesLabel, 'Minutes')],
    [t ? pad(t.s) : '--', str(p.secondsLabel, 'Seconds')],
  ]
  const shown = Math.round(num(p.units, 4, 2, 4))
  return (
    <div className="el-countdown" role="timer" aria-live="off">
      {parts.slice(4 - shown).map(([value, label]) => (
        <div className="el-countdown__cell" key={label}>
          <span className="el-countdown__value">{value}</span>
          <span className="el-countdown__label">{label}</span>
        </div>
      ))}
    </div>
  )
}
