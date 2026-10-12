import type { FormFieldDef } from './types'

/**
 * How a stored answer reads as plain text, for emails, the entry summary and
 * the CSV. Structured answers (an address, a matrix, an uploaded file, a
 * signature) are flattened here so every consumer shows them the same way.
 */

const optionLabelRaw = (options: FormFieldDef['options'], value: string): string =>
  (options || []).find((option) => String(option.value) === value)?.label || value

export function displayValue(field: FormFieldDef | undefined, value: unknown, labels = true): string {
  const optionLabel = (options: FormFieldDef['options'], raw: string): string => (labels ? optionLabelRaw(options, raw) : raw)
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'string') {
    // A drawn signature is a long data URL: never paste that into an email or a spreadsheet cell.
    if (value.startsWith('data:image/')) return '[signature captured]'
    if (field && (field.type === 'select' || field.type === 'radio')) return optionLabel(field.options, value)
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
          return String((entry as { name: string }).name)
        }
        return field && field.type === 'checkbox' ? optionLabel(field.options, String(entry ?? '')) : displayValue(undefined, entry, labels)
      })
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (field?.type === 'matrix') {
      return Object.entries(record)
        .map(([row, answer]) => {
          const rowLabel = (field.rows || []).find((candidate) => String(candidate.value) === row)?.label || row
          return `${rowLabel}: ${optionLabel(field.options, String(answer ?? ''))}`
        })
        .join('; ')
    }
    if (field?.type === 'address') {
      return ['line1', 'line2', 'city', 'region', 'postcode', 'country']
        .map((key) => record[key])
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join(', ')
    }
    if (typeof record.name === 'string' && typeof record.key === 'string') return record.name
    return JSON.stringify(record)
  }

  return String(value)
}
