/**
 * Reading the consent log back: parsing audit rows, filtering, the totals and
 * the per-day acceptance rate, and a safe CSV.
 *
 * Pure on purpose (no database, no request), so it is unit tested and the
 * admin route is a thin wrapper. The rows come from the audit log's
 * `consent.update` entries written by log.ts. Those hold a random decision id,
 * the policy version, the three optional categories and, with geo logging on,
 * a country. No IP address or user agent is ever stored with them, so none can
 * be shown or exported here.
 */

import { CONSENT_CATEGORIES, type CookieCategory } from './consent'

export type ConsentOutcome = 'accepted' | 'rejected' | 'custom'

export type ConsentLogRecord = {
  /** Audit row id. */
  rowId: number | string
  /** ISO timestamp of the decision. */
  createdAt: string
  /** Two-letter country, when geo logging was on. */
  region: string | null
  policyVersion: number
  choices: Record<CookieCategory, boolean>
  outcome: ConsentOutcome
}

export type RawAuditRow = {
  id?: number | string | null
  created_at?: string | null
  createdAt?: string | null
  detail?: string | null
}

export const classifyChoices = (choices: Record<CookieCategory, boolean>): ConsentOutcome => {
  const optional = [choices.preferences, choices.analytics, choices.marketing]
  if (optional.every(Boolean)) return 'accepted'
  if (!optional.some(Boolean)) return 'rejected'
  return 'custom'
}

/** One audit row to a record, or null when the row is not a well-formed consent entry. */
export function parseAuditRow(row: RawAuditRow): ConsentLogRecord | null {
  const createdAt = row.createdAt ?? row.created_at
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return null
  if (typeof row.detail !== 'string') return null
  let detail: unknown
  try {
    detail = JSON.parse(row.detail)
  } catch {
    return null
  }
  if (!detail || typeof detail !== 'object') return null
  const d = detail as { v?: unknown; c?: unknown; region?: unknown }
  if (typeof d.v !== 'number' || !d.c || typeof d.c !== 'object') return null
  const c = d.c as Record<string, unknown>
  const choices: Record<CookieCategory, boolean> = {
    necessary: true,
    preferences: c.preferences === true,
    analytics: c.analytics === true,
    marketing: c.marketing === true,
  }
  const region = typeof d.region === 'string' && /^[A-Z]{2}$/.test(d.region) ? d.region : null
  return {
    rowId: row.id ?? '',
    createdAt,
    region,
    policyVersion: d.v,
    choices,
    outcome: classifyChoices(choices),
  }
}

export const parseAuditRows = (rows: RawAuditRow[]): ConsentLogRecord[] =>
  rows.map(parseAuditRow).filter((record): record is ConsentLogRecord => record !== null)

export type ConsentFilter = {
  /** Inclusive ISO date or timestamp. */
  from?: string | null
  to?: string | null
  category?: CookieCategory | null
  /** With a category: only decisions that granted it ('granted') or refused it ('refused'). */
  state?: 'granted' | 'refused' | null
}

export const isFilterCategory = (value: unknown): value is Exclude<CookieCategory, 'necessary'> =>
  typeof value === 'string' && value !== 'necessary' && (CONSENT_CATEGORIES as readonly string[]).includes(value)

export function filterRecords(records: ConsentLogRecord[], filter: ConsentFilter): ConsentLogRecord[] {
  const from = filter.from ? Date.parse(filter.from) : NaN
  const to = filter.to ? Date.parse(filter.to) : NaN
  return records.filter((record) => {
    const time = Date.parse(record.createdAt)
    if (!Number.isNaN(from) && time < from) return false
    if (!Number.isNaN(to) && time > to) return false
    if (filter.category && filter.category !== 'necessary') {
      const granted = record.choices[filter.category]
      if ((filter.state ?? 'granted') === 'granted' ? !granted : granted) return false
    }
    return true
  })
}

export type DailyPoint = {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string
  total: number
  accepted: number
  /** Accepted-all decisions as a share of the day's decisions, 0 to 1. Null on a day with none. */
  rate: number | null
}

export type ConsentSummary = {
  total: number
  accepted: number
  rejected: number
  custom: number
  daily: DailyPoint[]
}

const dayKey = (time: number): string => new Date(time).toISOString().slice(0, 10)

/**
 * Totals and one point per UTC day for the last `days` days ending at `now`
 * (inclusive, so `days` points, empty days included so the chart has no gaps).
 */
export function summarise(records: ConsentLogRecord[], days: number, now: number = Date.now()): ConsentSummary {
  const span = Math.min(Math.max(Math.floor(days), 1), 366)
  const end = Date.parse(`${dayKey(now)}T00:00:00.000Z`)
  const start = end - (span - 1) * 86_400_000
  const buckets = new Map<string, DailyPoint>()
  for (let i = 0; i < span; i++) {
    const date = dayKey(start + i * 86_400_000)
    buckets.set(date, { date, total: 0, accepted: 0, rate: null })
  }

  const summary: ConsentSummary = { total: 0, accepted: 0, rejected: 0, custom: 0, daily: [] }
  for (const record of records) {
    const time = Date.parse(record.createdAt)
    if (Number.isNaN(time) || time < start || time >= end + 86_400_000) continue
    const bucket = buckets.get(dayKey(time))
    if (!bucket) continue
    summary.total += 1
    bucket.total += 1
    summary[record.outcome] += 1
    if (record.outcome === 'accepted') bucket.accepted += 1
  }
  for (const bucket of buckets.values()) bucket.rate = bucket.total ? bucket.accepted / bucket.total : null
  summary.daily = Array.from(buckets.values())
  return summary
}

/**
 * Makes one CSV cell safe to open in a spreadsheet. A cell that starts with
 * = + - @ (or a tab or carriage return) can be run as a formula, so it is
 * prefixed with an apostrophe; the cell is quoted when it holds a comma,
 * quote or line break.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const CSV_HEADER = ['date', 'region', 'policy_version', 'necessary', 'preferences', 'analytics', 'marketing', 'outcome']

export function recordsToCsv(records: ConsentLogRecord[]): string {
  const yesNo = (value: boolean) => (value ? 'granted' : 'refused')
  const lines = [CSV_HEADER.join(',')]
  for (const r of records) {
    lines.push(
      [
        r.createdAt,
        r.region ?? '',
        r.policyVersion,
        yesNo(r.choices.necessary),
        yesNo(r.choices.preferences),
        yesNo(r.choices.analytics),
        yesNo(r.choices.marketing),
        r.outcome,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}
