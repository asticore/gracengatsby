/**
 * Format cell values for list display.
 * Handles relationships (objects), uploads/media (with URL), checkboxes, dates, selects, and more.
 */

import type { Field } from '@/engine'
import type { CellFormatter } from '@/admin/cellRegistry'

export function formatCellValue(
  cell: unknown,
  doc: Record<string, unknown>,
  columnField: Field | undefined,
  formatter: CellFormatter | undefined,
): string {
  // Custom formatter (from cellRegistry) takes precedence
  if (formatter) {
    return formatter(cell, doc)
  }

  // Null/undefined
  if (cell === null || cell === undefined) {
    return ''
  }

  // Field type-specific formatting
  if (columnField) {
    const fieldType = (columnField as { type?: string }).type

    // Checkbox -> Yes/No
    if (fieldType === 'checkbox') {
      return cell === true ? 'Yes' : 'No'
    }

    // Date -> locale date
    if (fieldType === 'date' || fieldType === 'datetime') {
      if (typeof cell === 'string') {
        const d = new Date(cell)
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            ...(fieldType === 'datetime' && { hour: '2-digit', minute: '2-digit' }),
          })
        }
      }
      return String(cell)
    }

    // Select -> option label
    if (fieldType === 'select' || fieldType === 'radio') {
      const options = (columnField as { options?: Array<{ label?: string; value?: string }> }).options
      if (Array.isArray(options) && typeof cell === 'string') {
        const found = options.find((o) => o.value === cell)
        return found?.label || cell
      }
    }

    // Upload/Media -> small thumbnail if has url/filename
    if (fieldType === 'upload') {
      if (typeof cell === 'object' && cell !== null) {
        const obj = cell as Record<string, unknown>
        const url = obj.url || obj.filename
        if (typeof url === 'string') {
          return `[Image]` // Simplified; real implementation could render <img>
        }
      }
      return ''
    }

    // Relationship -> title/name/email/filename/id, arrays joined
    if (fieldType === 'relationship') {
      if (Array.isArray(cell)) {
        return cell.map((item) => extractDisplayValue(item)).filter(Boolean).join(', ')
      } else if (typeof cell === 'object' && cell !== null) {
        return extractDisplayValue(cell)
      }
    }
  }

  // Fallback: primitives as string
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
    return String(cell)
  }

  // Object fallback: no raw JSON dump; try to extract a display value
  if (typeof cell === 'object') {
    const str = extractDisplayValue(cell)
    if (str) return str
  }

  return ''
}

/**
 * Extract a readable value from an object (e.g., relationship document).
 * Looks for title, name, email, filename, id in that order.
 */
function extractDisplayValue(obj: unknown): string {
  if (typeof obj !== 'object' || obj === null) {
    return ''
  }

  const record = obj as Record<string, unknown>
  const displayFields = ['title', 'name', 'email', 'filename', 'id']

  for (const field of displayFields) {
    const value = record[field]
    if (value !== null && value !== undefined && value !== '') {
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value)
      }
    }
  }

  return ''
}
