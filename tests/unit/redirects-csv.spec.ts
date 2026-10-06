import { describe, it, expect } from 'vitest'
import { toCsv, parseCsv } from '@/features/redirects/csv'

describe('CSV Export/Import', () => {
  describe('toCsv', () => {
    it('exports redirects to RFC 4180 CSV with header', () => {
      const rows = [
        {
          fromPath: '/old',
          toPath: '/new',
          redirectType: '301',
          enabled: true,
          note: 'migrated',
        },
      ]
      const csv = toCsv(rows)
      expect(csv).toContain('fromPath,toPath,redirectType,enabled,note')
      expect(csv).toContain('/old,/new,301,true,migrated')
    })

    it('escapes fields containing commas and quotes', () => {
      const rows = [
        {
          fromPath: '/old,path',
          toPath: '/new"path',
          redirectType: '301',
        },
      ]
      const csv = toCsv(rows)
      expect(csv).toContain('"/old,path"')
      expect(csv).toContain('"/new""path"')
    })

    it('defaults enabled to true and note to empty', () => {
      const rows = [
        {
          fromPath: '/a',
          toPath: '/b',
          redirectType: '302',
        },
      ]
      const csv = toCsv(rows)
      expect(csv).toContain('/a,/b,302,true,')
    })
  })

  describe('parseCsv', () => {
    it('parses valid CSV with required fields', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
/old,/new,301,true,note1`
      const result = parseCsv(csv)
      expect(result.valid).toBe(true)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toMatchObject({
        fromPath: '/old',
        toPath: '/new',
        redirectType: '301',
        enabled: true,
        note: 'note1',
      })
    })

    it('handles quoted fields with embedded commas', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
"/old,path","/new,path",301,true,note`
      const result = parseCsv(csv)
      expect(result.valid).toBe(true)
      expect(result.rows[0].fromPath).toBe('/old,path')
      expect(result.rows[0].toPath).toBe('/new,path')
    })

    it('rejects empty CSV', () => {
      const result = parseCsv('')
      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toContain('Empty')
    })

    it('rejects invalid header', () => {
      const csv = `invalid,header,here`
      const result = parseCsv(csv)
      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toContain('Header must start with')
    })

    it('rejects rows missing required fields', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
/old,,301`
      const result = parseCsv(csv)
      expect(result.valid).toBe(false)
      expect(result.errors[0].line).toBe(2)
    })

    it('validates redirects using validate.ts', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
invalid,/new,301`
      const result = parseCsv(csv)
      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toContain('must start with')
    })

    it('rejects duplicates in existing redirects', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
/old,/new,301,true,`
      const existing = [
        { id: 1, fromPath: '/old', toPath: '/other', enabled: true },
      ]
      const result = parseCsv(csv, existing)
      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toContain('already in use')
    })

    it('enforces max 1000 rows', () => {
      const rows = Array.from({ length: 1001 }, (_, i) => ({
        fromPath: `/old${i}`,
        toPath: `/new${i}`,
        redirectType: '301',
      }))
      const csv = `fromPath,toPath,redirectType,enabled,note\n` + rows.map(r => `${r.fromPath},${r.toPath},${r.redirectType}`).join('\n')
      const result = parseCsv(csv)
      expect(result.rows).toHaveLength(1000)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(e => e.message.includes('exceeds maximum'))).toBe(true)
    })

    it('defaults enabled to true when omitted', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
/old,/new,301,,`
      const result = parseCsv(csv)
      expect(result.valid).toBe(true)
      expect(result.rows[0].enabled).toBe(true)
    })

    it('defaults note to empty string when omitted', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
/old,/new,301,true,`
      const result = parseCsv(csv)
      expect(result.valid).toBe(true)
      expect(result.rows[0].note).toBe('')
    })

    it('skips empty lines', () => {
      const csv = `fromPath,toPath,redirectType,enabled,note
/old,/new,301,true,note

`
      const result = parseCsv(csv)
      expect(result.rows).toHaveLength(1)
    })
  })
})
