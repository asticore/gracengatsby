import type { FormDoc, FormFieldDef, SubmissionValues } from './types'

import { PRESENTATIONAL_TYPES } from './types'

/**
 * CSV export of stored entries.
 *
 * Columns come from the form's field definitions rather than from the keys
 * present in the rows, so the export has a stable shape: a field nobody filled
 * in still gets an empty column, and a field renamed since a submission was
 * taken still gets its column instead of the file silently changing width
 * halfway down. Any key found in the data but not in the definitions is
 * appended at the end, so nothing is ever dropped.
 */

const escape = (value: string): string =>
  /["\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

/**
 * Neutralises a value that a spreadsheet would otherwise run as a formula.
 *
 * Anything a visitor typed lands in this file, and Excel and Sheets both
 * execute a cell beginning with = + - or @ on open. Prefixing a tab keeps the
 * text readable while stopping it being interpreted - the standard defence, and
 * the reason this is not just `String(value)`.
 */
const defuse = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `\t${value}` : value)

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return escape(defuse(value.map((entry) => String(entry ?? '')).join('; ')))
  if (typeof value === 'object') return escape(defuse(JSON.stringify(value)))
  return escape(defuse(String(value)))
}

/** Fields that hold an answer, in the order the form asks for them. */
export const answerFields = (form: FormDoc): FormFieldDef[] =>
  (form?.fields || []).filter((field) => field?.name && !PRESENTATIONAL_TYPES.includes(field.type))

export type ExportRow = {
  id: number | string
  createdAt?: string
  ip?: string
  total?: number
  paymentStatus?: string
  values: SubmissionValues
}

export function buildCsv(form: FormDoc, rows: ExportRow[]): string {
  const defined = answerFields(form)
  const names = defined.map((field) => field.name)

  const extras: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row.values || {})) {
      if (!names.includes(key) && !extras.includes(key)) extras.push(key)
    }
  }

  const header = [
    'Entry ID',
    'Submitted',
    'IP address',
    ...defined.map((field) => field.label || field.name),
    ...extras,
    'Total',
    'Payment status',
  ]

  const lines = [header.map((value) => escape(value)).join(',')]

  for (const row of rows) {
    const values = row.values || {}
    lines.push(
      [
        cell(row.id),
        cell(row.createdAt),
        cell(row.ip),
        ...names.map((name) => cell(values[name])),
        ...extras.map((name) => cell(values[name])),
        cell(row.total),
        cell(row.paymentStatus),
      ].join(','),
    )
  }

  // A trailing newline: some tools treat a file without one as truncated.
  return `${lines.join('\r\n')}\r\n`
}

/** A filename that sorts by date and survives being downloaded on any platform. */
export function csvFilename(form: FormDoc, now = new Date()): string {
  const slug = (form?.title || 'form')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug || 'form'}-entries-${now.toISOString().slice(0, 10)}.csv`
}
