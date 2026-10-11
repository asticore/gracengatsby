// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'

import { parseCsv, sniffDelimiter, toCsv } from '@/lib/spreadsheet/csv'
import { excelSerialToIso, readXlsx, XlsxError } from '@/lib/spreadsheet/xlsx'
import { parseSpreadsheetBytes } from '@/lib/spreadsheet'

describe('csv parser', () => {
  it('handles quotes, escaped quotes, embedded newlines and CRLF', () => {
    const { rows } = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,2,3')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
      ['1', '2', '3'],
    ])
  })
  it('strips a BOM, handles lone CR and skips blank lines', () => {
    expect(parseCsv('﻿a,b\r1,2\r\r3,4\n').rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })
  it('keeps empty fields and a quoted empty row', () => {
    expect(parseCsv('a,,c\n,,\n"",x,').rows).toEqual([['a', '', 'c'], ['', '', ''], ['', 'x', '']])
  })
  it('sniffs semicolon and tab delimiters, ignoring delimiters inside quotes', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(sniffDelimiter('"a,b,c";d\n1;2')).toBe(';')
    expect(sniffDelimiter('a,b\n1,2')).toBe(',')
    expect(sniffDelimiter('single')).toBe(',')
    expect(parseCsv('n;v\nx;1,5').rows).toEqual([['n', 'v'], ['x', '1,5']])
  })
  it('treats a quote in the middle of a field literally', () => {
    expect(parseCsv('5" pipe,ok').rows).toEqual([['5" pipe', 'ok']])
  })
  it('caps rows and flags truncation only when more follows', () => {
    const r = parseCsv('a\n1\n2\n3\n', { maxRows: 2 })
    expect(r.rows).toHaveLength(2)
    expect(r.truncated).toBe(true)
    expect(parseCsv('a\n1\n', { maxRows: 2 }).truncated).toBe(false)
  })
  it('round trips through toCsv', () => {
    const rows = [['a', 'b,c'], ['"q"', 'x\ny']]
    expect(parseCsv(toCsv(rows)).rows).toEqual(rows)
  })
})

const sheetXml = (rows: string) => `<?xml version="1.0"?><worksheet xmlns="x"><sheetData>${rows}</sheetData></worksheet>`
function makeXlsx(sheet: string, extra: Record<string, string> = {}, styles?: string, shared?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId9"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId9" Type="t" Target="worksheets/data.xml"/></Relationships>'),
    'xl/worksheets/data.xml': strToU8(sheet),
  }
  if (styles) files['xl/styles.xml'] = strToU8(styles)
  if (shared) files['xl/sharedStrings.xml'] = strToU8(shared)
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v)
  return zipSync(files)
}

describe('xlsx reader', () => {
  it('reads shared, inline, number, boolean and formula-string cells with gaps', () => {
    const data = makeXlsx(
      sheetXml(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>in &amp; line</t></is></c><c r="B2"><v>12.5</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="str"><f>A1</f><v>calc</v></c><c r="E2" t="e"><v>#N/A</v></c></row>',
      ),
      {},
      undefined,
      '<sst><si><t>Name</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>',
    )
    expect(readXlsx(data).rows).toEqual([
      ['Name', '', 'Rich text'],
      ['in & line', '12.5', 'TRUE', 'calc'],
    ])
  })
  it('converts serials only when the style is a date format', () => {
    const styles =
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="20"/></cellXfs></styleSheet>'
    const data = makeXlsx(
      sheetXml('<row r="1"><c r="A1" s="1"><v>45000</v></c><c r="B1" s="2"><v>45000.5</v></c><c r="C1" s="3"><v>45000</v></c><c r="D1"><v>45000</v></c><c r="E1" s="4"><v>0.5</v></c></row>'),
      {},
      styles,
    )
    expect(readXlsx(data).rows).toEqual([['2023-03-15', '2023-03-15T12:00:00', '45000', '45000', '12:00:00']])
    expect(excelSerialToIso(45000)).toBe('2023-03-15')
  })
  it('rolls a time just under midnight over to the next date', () => {
    expect(excelSerialToIso(45000.999999)).toBe('2023-03-16')
    expect(excelSerialToIso(45000.5)).toBe('2023-03-15T12:00:00')
  })
  it('reads a sheet with an unclosed <row> in linear time and keeps earlier rows', () => {
    const rows = '<row r="1"><c r="A1" t="inlineStr"><is><t>ok</t></is></c></row>' + '<row r="2">'.repeat(20000)
    const started = Date.now()
    const result = readXlsx(makeXlsx(sheetXml(rows)))
    expect(Date.now() - started).toBeLessThan(2000)
    expect(result.rows).toEqual([['ok']])
  })
  it('does not mistake <cols> or <col> for a cell or <rowBreaks> for a row', () => {
    const xml = sheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>') + '<cols><col min="1" max="1"/></cols><rowBreaks count="1"><brk id="1"/></rowBreaks>'
    expect(readXlsx(makeXlsx(xml)).rows).toEqual([['x']])
  })
  it('falls back to sheet1.xml and ignores merged cells', () => {
    const data = zipSync({
      'xl/workbook.xml': strToU8('<workbook/>'),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>') + '<mergeCells><mergeCell ref="A1:B1"/></mergeCells>'),
    })
    expect(readXlsx(data).rows).toEqual([['x']])
  })
  it('caps rows', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join('')
    const r = readXlsx(makeXlsx(sheetXml(rows)), { maxRows: 4 })
    expect(r.rows).toHaveLength(4)
    expect(r.truncated).toBe(true)
  })
  it('rejects non-zip, missing workbook, too many entries and zip bombs', () => {
    expect(() => readXlsx(strToU8('hello world'))).toThrow(XlsxError)
    expect(() => readXlsx(zipSync({ 'a.txt': strToU8('x') }))).toThrow(XlsxError)
    const many: Record<string, Uint8Array> = { 'xl/workbook.xml': strToU8('<workbook/>') }
    for (let i = 0; i < 210; i++) many[`f${i}.txt`] = strToU8('x')
    expect(() => readXlsx(zipSync(many))).toThrow(/too many/)
    const bomb = zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/worksheets/sheet1.xml': new Uint8Array(21 * 1024 * 1024) })
    expect(bomb.length).toBeLessThan(200 * 1024)
    expect(() => readXlsx(bomb)).toThrow(/too large/)
  })
  it('does not allocate for absurd row numbers', () => {
    const data = makeXlsx(sheetXml('<row r="1"><c r="A1"><v>1</v></c></row><row r="4000000000"><c r="A4000000000"><v>2</v></c></row>'))
    expect(readXlsx(data).rows).toEqual([['1']])
  })
})

describe('parseSpreadsheetBytes', () => {
  it('rejects .xls and unknown types with clear messages', () => {
    expect(parseSpreadsheetBytes('a.xls', new Uint8Array(4))).toMatchObject({ ok: false, error: expect.stringContaining('.xls') })
    expect(parseSpreadsheetBytes('a.pdf', new Uint8Array(4))).toMatchObject({ ok: false })
  })
  it('enforces 2 MB', () => {
    expect(parseSpreadsheetBytes('a.csv', new Uint8Array(2 * 1024 * 1024 + 1))).toMatchObject({ ok: false, error: expect.stringContaining('2 MB') })
  })
  it('parses csv and tsv', () => {
    expect(parseSpreadsheetBytes('a.csv', strToU8('a,b\n1,2'))).toMatchObject({ ok: true, rows: [['a', 'b'], ['1', '2']] })
    expect(parseSpreadsheetBytes('a.tsv', strToU8('a\tb\n1,5\t2'))).toMatchObject({ ok: true, rows: [['a', 'b'], ['1,5', '2']] })
  })
})
