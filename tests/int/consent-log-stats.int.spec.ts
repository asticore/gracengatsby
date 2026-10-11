import { describe, expect, it } from 'vitest'

import {
  classifyChoices,
  csvCell,
  filterRecords,
  parseAuditRow,
  parseAuditRows,
  recordsToCsv,
  summarise,
  type ConsentLogRecord,
} from '@/features/consent/logStats'
import { consentLogDetail } from '@/features/consent/log'

const NOW = Date.parse('2026-10-11T12:00:00Z')

const row = (createdAt: string, c: { preferences: boolean; analytics: boolean; marketing: boolean }, region: string | null = null, v = 1) => ({
  id: createdAt,
  createdAt,
  detail: consentLogDetail({ id: 'abcdefgh1234', v, c }, region),
})
const ALL = { preferences: true, analytics: true, marketing: true }
const NONE = { preferences: false, analytics: false, marketing: false }

describe('consent log parsing', () => {
  it('reads what the consent route writes', () => {
    const record = parseAuditRow(row('2026-10-10T08:00:00Z', ALL, 'DE', 4))
    expect(record).toMatchObject({ region: 'DE', policyVersion: 4, outcome: 'accepted' })
    expect(record?.choices.necessary).toBe(true)
  })

  it('has no field that could hold an address or browser', () => {
    const record = parseAuditRow({ ...row('2026-10-10T08:00:00Z', ALL), ip: '203.0.113.9', userAgent: 'x' } as never)
    expect(JSON.stringify(record)).not.toMatch(/203\.0\.113|userAgent|"ip"/)
  })

  it('skips rows that are not consent entries', () => {
    const rows = parseAuditRows([
      { id: 1, createdAt: '2026-10-10T08:00:00Z', detail: 'not json' },
      { id: 2, createdAt: 'nope', detail: '{"v":1,"c":{}}' },
      { id: 3, createdAt: '2026-10-10T08:00:00Z', detail: null },
      { id: 4, createdAt: '2026-10-10T08:00:00Z', detail: '{"v":"x","c":{}}' },
      row('2026-10-10T09:00:00Z', NONE),
    ])
    expect(rows).toHaveLength(1)
  })

  it('ignores a region that is not a two-letter code', () => {
    const record = parseAuditRow({ createdAt: '2026-10-10T08:00:00Z', detail: '{"v":1,"c":{},"region":"<b>"}' })
    expect(record?.region).toBeNull()
  })

  it('classifies outcomes', () => {
    expect(classifyChoices({ necessary: true, ...ALL })).toBe('accepted')
    expect(classifyChoices({ necessary: true, ...NONE })).toBe('rejected')
    expect(classifyChoices({ necessary: true, ...NONE, analytics: true })).toBe('custom')
  })
})

describe('consent log aggregation', () => {
  const records = parseAuditRows([
    row('2026-10-11T09:00:00Z', ALL),
    row('2026-10-11T10:00:00Z', NONE),
    row('2026-10-11T11:00:00Z', ALL),
    row('2026-10-09T10:00:00Z', { ...NONE, analytics: true }),
    row('2026-09-01T10:00:00Z', ALL), // outside the window
  ])

  it('totals the window and groups by UTC day with no gaps', () => {
    const summary = summarise(records, 7, NOW)
    expect(summary).toMatchObject({ total: 4, accepted: 2, rejected: 1, custom: 1 })
    expect(summary.daily).toHaveLength(7)
    expect(summary.daily[6]).toMatchObject({ date: '2026-10-11', total: 3, accepted: 2 })
    expect(summary.daily[6].rate).toBeCloseTo(2 / 3)
    expect(summary.daily[5]).toMatchObject({ date: '2026-10-10', total: 0, rate: null })
    expect(summary.daily[4]).toMatchObject({ date: '2026-10-09', total: 1, rate: 0 })
  })

  it('handles an empty log', () => {
    const summary = summarise([], 30, NOW)
    expect(summary.total).toBe(0)
    expect(summary.daily).toHaveLength(30)
    expect(summary.daily.every((day) => day.rate === null)).toBe(true)
  })

  it('bounds the window', () => {
    expect(summarise([], 100000, NOW).daily).toHaveLength(366)
    expect(summarise([], 0, NOW).daily).toHaveLength(1)
  })
})

describe('consent log filters', () => {
  const records = parseAuditRows([
    row('2026-10-11T09:00:00Z', ALL),
    row('2026-10-10T09:00:00Z', NONE),
    row('2026-10-09T09:00:00Z', { ...NONE, marketing: true }),
  ])

  it('filters by date range, inclusive', () => {
    expect(filterRecords(records, { from: '2026-10-10T00:00:00Z', to: '2026-10-10T23:59:59Z' })).toHaveLength(1)
    expect(filterRecords(records, { from: '2026-10-10T09:00:00Z' })).toHaveLength(2)
  })

  it('filters by category granted or refused', () => {
    expect(filterRecords(records, { category: 'marketing', state: 'granted' })).toHaveLength(2)
    expect(filterRecords(records, { category: 'marketing', state: 'refused' })).toHaveLength(1)
    expect(filterRecords(records, { category: 'analytics' })).toHaveLength(1)
  })
})

describe('CSV safety', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises a leading formula character in %j', (value) => {
    expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(3)).toBe('3')
  })

  it('writes a header and one line per record with no address column', () => {
    const records = parseAuditRows([row('2026-10-11T09:00:00Z', ALL, 'FR', 2)]) as ConsentLogRecord[]
    const lines = recordsToCsv(records).trim().split('\r\n')
    expect(lines[0]).toBe('date,region,policy_version,necessary,preferences,analytics,marketing,outcome')
    expect(lines[1]).toBe('2026-10-11T09:00:00Z,FR,2,granted,granted,granted,granted,accepted')
    expect(lines[0]).not.toMatch(/ip|agent/i)
  })
})
