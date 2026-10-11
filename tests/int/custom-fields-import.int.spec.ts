// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { autoMapColumns, buildImportRows, convertCell, fieldsFromHeader, slugifyName, sniffType, templateCsv, uniqueName } from '@/features/customFields/spreadsheetImport'
import type { CustomFieldDef } from '@/fields/customFields/types'

const def = (type: CustomFieldDef['type'], extra: Partial<CustomFieldDef> = {}): CustomFieldDef => ({ label: 'F', name: 'f', type, ...extra })
const val = (d: CustomFieldDef, raw: string) => {
  const c = convertCell(d, raw)
  return 'reason' in c ? `ERR:${c.reason}` : c.value
}

describe('convertCell', () => {
  it('numbers', () => {
    expect(val(def('number'), ' 12.5 ')).toBe(12.5)
    expect(val(def('number'), '1,234.5')).toBe(1234.5)
    expect(val(def('number'), '-3')).toBe(-3)
    expect(String(val(def('number'), 'abc'))).toContain('ERR')
    expect(String(val(def('number'), '1e999'))).toContain('ERR')
    expect(val(def('number'), '')).toBeUndefined()
  })
  it('checkboxes', () => {
    for (const t of ['true', 'YES', '1', 'y']) expect(val(def('checkbox'), t)).toBe(true)
    for (const f of ['false', 'No', '0']) expect(val(def('checkbox'), f)).toBe(false)
    expect(String(val(def('checkbox'), 'maybe'))).toContain('ERR')
  })
  it('selects match value or label, case-insensitively', () => {
    const d = def('select', { options: [{ label: 'Red', value: 'r' }, { label: 'Blue', value: 'b' }] })
    expect(val(d, 'RED')).toBe('r')
    expect(val(d, 'b')).toBe('b')
    expect(String(val(d, 'green'))).toContain('not one of')
    const multi = { ...d, multiple: true }
    expect(val(multi, 'Red; blue')).toEqual(['r', 'b'])
    expect(String(val(multi, 'red;green'))).toContain('ERR')
  })
  it('dates, datetimes and times', () => {
    expect(val(def('date'), '2024-03-05')).toBe('2024-03-05')
    expect(val(def('date'), '2024/3/5')).toBe('2024-03-05')
    expect(val(def('date'), '2024-03-05T10:00:00')).toBe('2024-03-05')
    expect(String(val(def('date'), '2024-02-30'))).toContain('ERR')
    expect(String(val(def('date'), '05/03/2024'))).toContain('ERR')
    expect(val(def('datetime'), '2024-03-05 9:30')).toBe('2024-03-05T09:30')
    expect(val(def('time'), '9:05:00')).toBe('09:05')
    expect(String(val(def('time'), '25:00'))).toContain('ERR')
  })
  it('colors and text', () => {
    expect(val(def('color'), 'ABC')).toBe('#aabbcc')
    expect(val(def('text'), '=SUM(A1)')).toBe('=SUM(A1)')
  })
})

describe('column mapping', () => {
  const fields = [def('text', { name: 'title', label: 'Item Name' }), def('number', { name: 'price', label: 'Price' }), def('text', { name: 'notes', label: 'Notes' })]
  it('matches by name or label, ignoring case and punctuation, each column once', () => {
    expect(autoMapColumns(['PRICE', 'item_name', 'Other'], fields)).toEqual({ title: 1, price: 0, notes: -1 })
    expect(autoMapColumns(['Title', 'item name'], fields)).toEqual({ title: 0, price: -1, notes: -1 })
  })
})

describe('buildImportRows', () => {
  const fields: CustomFieldDef[] = [
    def('text', { name: 'title', label: 'Title', required: true }),
    def('number', { name: 'price', label: 'Price', min: 0 }),
    def('checkbox', { name: 'on', label: 'On' }),
  ]
  const map = { title: 0, price: 1, on: 2 }
  it('converts, skips with reasons, reports line numbers', () => {
    const r = buildImportRows(fields, map, [['A', '5', 'yes'], ['', '3', ''], ['B', 'x', ''], ['C', '-1', ''], ['', '', ''], ['D', '', 'no']])
    expect(r.rows).toEqual([{ title: 'A', price: 5, on: true }, { title: 'D', on: false }])
    expect(r.skipped.map((s) => s.line)).toEqual([3, 4, 5, 6])
    expect(r.skipped[0].reason).toMatch(/required/)
    expect(r.skipped[1].reason).toMatch(/not a number/)
    expect(r.skipped[2].reason).toMatch(/at least|least|minimum|0/i)
    expect(r.skipped[3].reason).toBe('Empty row')
  })
  it('honours capacity and skipped columns', () => {
    const r = buildImportRows(fields, { title: 0, price: -1, on: -1 }, [['a'], ['b'], ['c']], { capacity: 2 })
    expect(r.rows).toHaveLength(2)
    expect(r.skipped).toEqual([{ line: 4, reason: 'Over the maximum number of rows' }])
  })
})

describe('header sniffing', () => {
  it('detects types', () => {
    expect(sniffType(['1', '2.5', '-3', '1,000'])).toBe('number')
    expect(sniffType(['2024-01-02', '2024-02-03'])).toBe('date')
    // Identifiers with leading zeros stay text; plain zero and decimals below one are still numbers.
    expect(sniffType(['00123', '00456'])).toBe('text')
    expect(sniffType(['01234', '5'])).toBe('text')
    expect(sniffType(['0', '0.5', '10'])).toBe('number')
    expect(sniffType(['yes', 'No', 'TRUE'])).toBe('checkbox')
    expect(sniffType(['hello', 'world'])).toBe('text')
    expect(sniffType(['x'.repeat(200)])).toBe('textarea')
    expect(sniffType(['a\nb'])).toBe('textarea')
    expect(sniffType(['', ''])).toBe('text')
    expect(sniffType(['1', 'two'])).toBe('text')
  })
  it('slugifies and dedupes names', () => {
    expect(slugifyName('Prix Été (€)')).toBe('prix_ete')
    expect(slugifyName('123 go')).toBe('f_123_go')
    expect(slugifyName('!!!')).toBe('field')
    const taken = new Set(['name'])
    expect(uniqueName('Name', taken)).toBe('name_2')
    expect(uniqueName('NAME', taken)).toBe('name_3')
  })
  it('builds fields from a header row', () => {
    const rows = [['Name', 'Name', 'Price', '', 'Active', 'When'], ['a', 'b', '1', 'z', 'yes', '2024-01-01']]
    expect(fieldsFromHeader(rows, ['title'])).toEqual([
      { label: 'Name', name: 'name', type: 'text' },
      { label: 'Name', name: 'name_2', type: 'text' },
      { label: 'Price', name: 'price', type: 'number' },
      { label: 'Active', name: 'active', type: 'checkbox' },
      { label: 'When', name: 'when', type: 'date' },
    ])
  })
})

describe('template', () => {
  it('uses sub field names as headers', () => {
    const d = def('repeater', { subFields: [def('text', { name: 'a' }), def('image', { name: 'img' }), def('number', { name: 'b' })] })
    expect(templateCsv(d)).toBe('a,b\r\n')
  })
})
