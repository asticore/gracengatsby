import { describe, expect, it } from 'vitest'
import { formatCellValue } from '@/admin/list/cellFormatting'
import type { Field } from '@/engine'

describe('formatCellValue', () => {
  describe('date formatting for system columns', () => {
    it('formats createdAt column as locale date+time', () => {
      const field: Field = {
        type: 'text',
        name: 'createdAt',
      } as unknown as Field

      const result = formatCellValue('2026-08-22T13:57:22.140Z', {}, field, undefined)
      expect(result).toMatch(/08\/2026/)
      expect(result).toMatch(/13:57/)
    })

    it('formats updatedAt column as locale date+time', () => {
      const field: Field = {
        type: 'text',
        name: 'updatedAt',
      } as unknown as Field

      const result = formatCellValue('2026-08-22T13:57:22.140Z', {}, field, undefined)
      expect(result).toMatch(/08\/2026/)
      expect(result).toMatch(/13:57/)
    })

    it('formats date field type as locale date+time', () => {
      const field: Field = {
        type: 'date',
        name: 'someDate',
      } as unknown as Field

      const result = formatCellValue('2026-08-22T13:57:22.140Z', {}, field, undefined)
      expect(result).toMatch(/08\/2026/)
      expect(result).toMatch(/13:57/)
    })

    it('formats datetime field type as locale date+time', () => {
      const field: Field = {
        type: 'datetime',
        name: 'someDateTime',
      } as unknown as Field

      const result = formatCellValue('2026-08-22T13:57:22.140Z', {}, field, undefined)
      expect(result).toMatch(/08\/2026/)
      expect(result).toMatch(/13:57/)
    })

    it('returns empty string for null/undefined', () => {
      const field: Field = {
        type: 'date',
        name: 'createdAt',
      } as unknown as Field

      expect(formatCellValue(null, {}, field, undefined)).toBe('')
      expect(formatCellValue(undefined, {}, field, undefined)).toBe('')
    })

    it('returns string unchanged if not valid ISO date', () => {
      const field: Field = {
        type: 'date',
        name: 'createdAt',
      } as unknown as Field

      const result = formatCellValue('not a date', {}, field, undefined)
      expect(result).toBe('not a date')
    })
  })

  describe('status column formatting', () => {
    it('capitalizes draft status', () => {
      const field: Field = {
        type: 'text',
        name: '_status',
      } as unknown as Field

      const result = formatCellValue('draft', {}, field, undefined)
      expect(result).toBe('Draft')
    })

    it('capitalizes published status', () => {
      const field: Field = {
        type: 'text',
        name: '_status',
      } as unknown as Field

      const result = formatCellValue('published', {}, field, undefined)
      expect(result).toBe('Published')
    })

    it('handles mixed case status', () => {
      const field: Field = {
        type: 'text',
        name: '_status',
      } as unknown as Field

      const result = formatCellValue('DRAFT', {}, field, undefined)
      expect(result).toBe('Draft')
    })

    it('does not double-capitalize already capitalized status', () => {
      const field: Field = {
        type: 'text',
        name: '_status',
      } as unknown as Field

      const result = formatCellValue('Published', {}, field, undefined)
      expect(result).toBe('Published')
    })
  })

  describe('checkbox formatting', () => {
    it('converts true to Yes', () => {
      const field: Field = {
        type: 'checkbox',
        name: 'active',
      } as unknown as Field

      const result = formatCellValue(true, {}, field, undefined)
      expect(result).toBe('Yes')
    })

    it('converts false to No', () => {
      const field: Field = {
        type: 'checkbox',
        name: 'active',
      } as unknown as Field

      const result = formatCellValue(false, {}, field, undefined)
      expect(result).toBe('No')
    })
  })

  describe('select field formatting', () => {
    it('returns option label for matching value', () => {
      const field: Field = {
        type: 'select',
        name: 'category',
        options: [
          { label: 'Feature', value: 'feature' },
          { label: 'Bug', value: 'bug' },
        ],
      } as unknown as Field

      const result = formatCellValue('feature', {}, field, undefined)
      expect(result).toBe('Feature')
    })

    it('returns raw value if no matching option', () => {
      const field: Field = {
        type: 'select',
        name: 'category',
        options: [
          { label: 'Feature', value: 'feature' },
        ],
      } as unknown as Field

      const result = formatCellValue('unknown', {}, field, undefined)
      expect(result).toBe('unknown')
    })
  })

  describe('fallback formatting', () => {
    it('returns string primitives as-is', () => {
      const result = formatCellValue('hello', {}, undefined, undefined)
      expect(result).toBe('hello')
    })

    it('converts numbers to strings', () => {
      const result = formatCellValue(42, {}, undefined, undefined)
      expect(result).toBe('42')
    })

    it('converts booleans to strings', () => {
      const result = formatCellValue(true, {}, undefined, undefined)
      expect(result).toBe('true')
    })

    it('returns empty string for unknown objects', () => {
      const result = formatCellValue({ someKey: 'someValue' }, {}, undefined, undefined)
      expect(result).toBe('')
    })
  })

  describe('system columns without field definition', () => {
    it('formats ISO date strings', () => {
      const result = formatCellValue('2026-10-02T23:09:23.874Z', {}, undefined, undefined)
      expect(result).not.toContain('T23:09')
      expect(result).toMatch(/2026/)
    })

    it('leaves plain strings alone', () => {
      expect(formatCellValue('2026 plan', {}, undefined, undefined)).toBe('2026 plan')
    })
  })

  describe('multi-select', () => {
    it('joins option labels for hasMany select', () => {
      const field = {
        name: 'roles',
        type: 'select',
        hasMany: true,
        options: [
          { label: 'Admin', value: 'admin' },
          { label: 'Customer', value: 'customer' },
        ],
      } as unknown as Field
      expect(formatCellValue(['admin', 'customer'], {}, field, undefined)).toBe('Admin, Customer')
    })
  })
})
