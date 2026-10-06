import { describe, it, expect } from 'vitest'
import { formatDateCell } from '@/admin/list/dateFormatter'

describe('dateFormatter.formatDateCell', () => {
  it('formats ISO date string to en-GB short format', () => {
    const result = formatDateCell('2026-10-06T14:30:00.000Z')
    expect(result).toBe('06/10/2026, 14:30')
  })

  it('handles midnight UTC', () => {
    const result = formatDateCell('2026-01-01T00:00:00.000Z')
    expect(result).toBe('01/01/2026, 00:00')
  })

  it('handles end of day UTC', () => {
    const result = formatDateCell('2026-12-31T23:59:59.999Z')
    expect(result).toBe('31/12/2026, 23:59')
  })

  it('returns empty string for null', () => {
    expect(formatDateCell(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatDateCell(undefined)).toBe('')
  })

  it('returns empty string for non-string input', () => {
    expect(formatDateCell(12345)).toBe('')
    expect(formatDateCell({})).toBe('')
    expect(formatDateCell([])).toBe('')
  })

  it('returns empty string for invalid ISO format', () => {
    expect(formatDateCell('not a date')).toBe('')
    expect(formatDateCell('2026-10-06')).toBe('')
    expect(formatDateCell('10/06/2026')).toBe('')
  })

  it('returns empty string for invalid date value', () => {
    expect(formatDateCell('2026-13-32T00:00:00.000Z')).toBe('')
  })

  it('handles date at millisecond precision', () => {
    const result = formatDateCell('2026-10-06T14:30:45.123Z')
    expect(result).toBe('06/10/2026, 14:30')
  })

  it('produces consistent output (no locale drift)', () => {
    const dateStr = '2026-10-06T14:30:00.000Z'
    const result1 = formatDateCell(dateStr)
    const result2 = formatDateCell(dateStr)
    expect(result1).toBe(result2)
  })
})
