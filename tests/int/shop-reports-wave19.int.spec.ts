// @vitest-environment node
// Shop reports (wave 19): pure shaping for the report screen and CSV export.
import { describe, expect, it } from 'vitest'

import { averageOrderCents, fillSeries, pageCount, pageOf, percentOfTotal } from '@/features/shopReports/shape'
import { toCsv, centsToDecimal } from '@/features/shopReports/csv'
import { bucketStart, defaultBucket, nextBucket, resolveRange } from '@/features/shopReports/range'
import { cachedReport, clearReportCache, REPORT_CACHE_MS } from '@/features/shopReports/cache'

const NOW = new Date('2026-10-14T09:30:00Z')

describe('resolveRange', () => {
  it('defaults to the last 30 days ending today, in UTC', () => {
    const r = resolveRange({}, NOW)
    expect(r).toMatchObject({ preset: '30d', to: '2026-10-14', from: '2026-09-15', days: 30, bucket: 'day' })
  })

  it('handles the 7 day, 90 day and this-month presets', () => {
    expect(resolveRange({ preset: '7d' }, NOW)).toMatchObject({ from: '2026-10-08', to: '2026-10-14', days: 7 })
    expect(resolveRange({ preset: '90d' }, NOW)).toMatchObject({ from: '2026-07-17', days: 90 })
    expect(resolveRange({ preset: 'month' }, NOW)).toMatchObject({ from: '2026-10-01', to: '2026-10-14', days: 14 })
  })

  it('takes custom dates, and falls back to 30 days when they are bad or reversed', () => {
    expect(resolveRange({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }, NOW)).toMatchObject({ preset: 'custom', from: '2026-01-01', to: '2026-01-31', days: 31 })
    expect(resolveRange({ preset: 'custom', from: '2026-02-01', to: '2026-01-01' }, NOW).preset).toBe('30d')
    expect(resolveRange({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }, NOW).preset).toBe('30d')
    expect(resolveRange({ preset: 'bogus' }, NOW).preset).toBe('30d')
  })

  it('shortens a custom range longer than a year to end at the chosen end date', () => {
    const r = resolveRange({ preset: 'custom', from: '2020-01-01', to: '2026-10-14' }, NOW)
    expect(r.days).toBe(366)
    expect(r.to).toBe('2026-10-14')
  })

  it('uses the requested bucket, or picks one from the length of the range', () => {
    expect(resolveRange({ bucket: 'month' }, NOW).bucket).toBe('month')
    expect(resolveRange({ bucket: 'nope' }, NOW).bucket).toBe('day')
    expect(defaultBucket(90)).toBe('day')
    expect(defaultBucket(180)).toBe('week')
    expect(defaultBucket(400)).toBe('month')
  })
})

describe('bucket starts', () => {
  it('starts weeks on Monday and months on the first', () => {
    expect(bucketStart('2026-10-14', 'week')).toBe('2026-10-12') // a Wednesday
    expect(bucketStart('2026-10-12', 'week')).toBe('2026-10-12')
    expect(bucketStart('2026-10-18', 'week')).toBe('2026-10-12') // a Sunday
    expect(bucketStart('2026-10-14', 'month')).toBe('2026-10-01')
    expect(bucketStart('2026-10-14', 'day')).toBe('2026-10-14')
  })

  it('moves to the next bucket, across month ends too', () => {
    expect(nextBucket('2026-10-31', 'day')).toBe('2026-11-01')
    expect(nextBucket('2026-10-12', 'week')).toBe('2026-10-19')
    expect(nextBucket('2026-01-01', 'month')).toBe('2026-02-01')
  })
})

describe('fillSeries', () => {
  it('gives every day a point, with zeros where nothing sold', () => {
    const points = fillSeries(
      [
        { bucket: '2026-10-02', orders: 2, revenueCents: 5000 },
        { bucket: '2026-10-04', orders: 1, revenueCents: 1250 },
      ],
      '2026-10-01',
      '2026-10-04',
      'day',
    )
    expect(points.map((p) => [p.bucket, p.orders, p.revenueCents])).toEqual([
      ['2026-10-01', 0, 0],
      ['2026-10-02', 2, 5000],
      ['2026-10-03', 0, 0],
      ['2026-10-04', 1, 1250],
    ])
  })

  it('merges rows that land in the same week or month', () => {
    const points = fillSeries(
      [
        { bucket: '2026-10-13', orders: 1, revenueCents: 100 },
        { bucket: '2026-10-14', orders: 2, revenueCents: 200 },
      ],
      '2026-10-12',
      '2026-10-18',
      'week',
    )
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ bucket: '2026-10-12', orders: 3, revenueCents: 300 })
  })
})

describe('numbers', () => {
  it('averages order value in whole cents and never divides by zero', () => {
    expect(averageOrderCents(1001, 2)).toBe(501)
    expect(averageOrderCents(5000, 0)).toBe(0)
  })

  it('gives a percentage to one decimal, or null with no base', () => {
    expect(percentOfTotal(1, 3)).toBe(33.3)
    expect(percentOfTotal(5, 0)).toBeNull()
  })

  it('clamps page numbers and counts pages', () => {
    expect(pageOf('3', 20)).toEqual({ page: 3, offset: 40, limit: 20 })
    expect(pageOf('-4', 20).page).toBe(1)
    expect(pageOf('abc', 20).page).toBe(1)
    expect(pageCount(0, 20)).toBe(1)
    expect(pageCount(41, 20)).toBe(3)
  })

  it('writes cents as a plain decimal amount', () => {
    expect(centsToDecimal(1234)).toBe('12.34')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(centsToDecimal(-250)).toBe('-2.50')
    expect(centsToDecimal(null)).toBe('')
  })
})

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks, and ends with CRLF', () => {
    const csv = toCsv(['Name', 'Units'], [['Mug, large', 2], ['Say "hi"', 1]])
    expect(csv).toBe('Name,Units\r\n"Mug, large",2\r\n"Say ""hi""",1\r\n')
  })

  it('stops spreadsheet formulas from running', () => {
    const csv = toCsv(['Product'], [['=HYPERLINK("x")'], ['+1+1'], ['-cmd'], ['@sum'], ['Plain']])
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")"`)
    expect(lines[2]).toBe(`'+1+1`)
    expect(lines[3]).toBe(`'-cmd`)
    expect(lines[4]).toBe(`'@sum`)
    expect(lines[5]).toBe('Plain')
  })

  it('leaves empty cells empty', () => {
    expect(toCsv(['A', 'B'], [[null, undefined]])).toBe('A,B\r\n,\r\n')
  })
})

describe('report cache', () => {
  it('reuses a result for five minutes, then loads again', async () => {
    clearReportCache()
    let calls = 0
    let clock = 1_000_000
    const load = async () => ++calls
    const now = () => clock
    expect(await cachedReport('k', load, now)).toBe(1)
    clock += REPORT_CACHE_MS - 1
    expect(await cachedReport('k', load, now)).toBe(1)
    clock += 2
    expect(await cachedReport('k', load, now)).toBe(2)
    clearReportCache()
  })
})
