import type { FormFieldDef, SubmissionValues } from './types'

import { PRESENTATIONAL_TYPES } from './types'

/**
 * Server-side validation of a submission, one rule set for every field type.
 *
 * The browser runs the same checks for a friendlier experience, but nothing
 * the browser says is believed: this is the judge. It also *normalises*: it
 * returns the values as they should be stored (a matrix reduced to known rows
 * and columns, an address reduced to its known parts, a rating as a number), so
 * a hand-crafted request cannot smuggle extra keys or oversized blobs into an
 * entry.
 *
 * Pure: no I/O. The caller passes `now` so date-window rules are testable.
 */

export const MAX_TEXT_LENGTH = 20_000
export const MAX_SIGNATURE_BYTES = 150_000
const MAX_PATTERN_LENGTH = 200
const MAX_PATTERN_INPUT = 2000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)$/
const SIGNATURE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

export const ADDRESS_KEYS = ['line1', 'line2', 'city', 'region', 'postcode', 'country'] as const

export const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'boolean') return value === false
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return String(value).trim() === ''
}

const isRealDate = (text: string): boolean => {
  const match = DATE_PATTERN.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const padTime = (text: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : text.trim()
}

const optionValues = (field: FormFieldDef): string[] =>
  (field.options || []).map((option) => String(option?.value ?? '').trim()).filter(Boolean)

const clampText = (value: unknown): string => String(value ?? '').slice(0, MAX_TEXT_LENGTH)

/** Slot times a visitor may choose for an appointment, normalised to HH:MM. */
export const appointmentSlots = (field: FormFieldDef): string[] =>
  (field.appointment?.slots || []).map(padTime).filter((slot) => TIME_PATTERN.test(slot))

function checkPattern(field: FormFieldDef, text: string): string | null {
  const pattern = field.validation?.pattern
  if (!pattern) return null
  if (pattern.length > MAX_PATTERN_LENGTH) return null
  let expression: RegExp
  try {
    expression = new RegExp(pattern, 'u')
  } catch {
    // A broken pattern is the author's mistake, not the visitor's: do not block the form over it.
    return null
  }
  if (text.length > MAX_PATTERN_INPUT) return field.validation?.patternMessage || 'That is not in the expected format.'
  return expression.test(text) ? null : field.validation?.patternMessage || 'That is not in the expected format.'
}

export type ValidationResult = {
  errors: Record<string, string>
  /** The values to store: normalised, and limited to what each field allows. */
  values: SubmissionValues
}

export function validateSubmission(
  fields: FormFieldDef[],
  input: SubmissionValues,
  visible: Set<string>,
  now: Date = new Date(),
): ValidationResult {
  const errors: Record<string, string> = {}
  const values: SubmissionValues = { ...input }

  for (const field of fields || []) {
    if (!field?.name || PRESENTATIONAL_TYPES.includes(field.type!)) continue
    if (field.type === 'calculation') continue
    if (!visible.has(field.name)) continue
    // Files are judged separately, from the uploaded bytes (see upload.ts).
    if (field.type === 'file') continue

    const name = field.name
    const labelled = field.label || name
    const raw = input[name]

    const result = validateField(field, raw, labelled, now)
    if (result.error) {
      errors[name] = result.error
      continue
    }
    if (result.value === undefined) {
      delete values[name]
    } else {
      values[name] = result.value
    }
  }

  return { errors, values }
}

type FieldResult = { error?: string; value?: unknown }

function validateField(field: FormFieldDef, raw: unknown, labelled: string, now: Date): FieldResult {
  const type = field.type

  // A single yes/no checkbox and the consent box are booleans, so "blank"
  // means unticked, which is only a problem when the field is required.
  if (type === 'consent') {
    const ticked = raw === true || raw === 'true' || raw === 'on' || raw === 1
    if (field.required && !ticked) return { error: 'You need to agree to continue.' }
    return { value: ticked }
  }

  if (type === 'checkbox' && optionValues(field).length === 0) {
    const ticked = raw === true || raw === 'true' || raw === 'on' || raw === 1
    if (field.required && !ticked) return { error: `${labelled} is required.` }
    return { value: ticked }
  }

  if (type === 'matrix') return validateMatrix(field, raw, labelled)
  if (type === 'address') return validateAddress(field, raw, labelled)

  if (isBlank(raw)) {
    if (field.required) return { error: `${labelled} is required.` }
    return { value: undefined }
  }

  switch (type) {
    case 'email': {
      const text = String(raw).trim()
      if (text.length > 254 || !EMAIL_PATTERN.test(text)) return { error: 'That does not look like an email address.' }
      return { value: text }
    }

    case 'number': {
      const parsed = Number(String(raw).replace(/[^0-9.+-]/g, ''))
      if (!Number.isFinite(parsed)) return { error: 'Please enter a number.' }
      if (typeof field.min === 'number' && parsed < field.min) return { error: `Must be ${field.min} or more.` }
      if (typeof field.max === 'number' && parsed > field.max) return { error: `Must be ${field.max} or less.` }
      return { value: String(raw).trim().slice(0, 40) }
    }

    case 'select':
    case 'radio': {
      const text = String(raw).trim()
      const allowed = optionValues(field)
      if (allowed.length > 0 && !allowed.includes(text)) return { error: 'Please choose one of the options.' }
      return { value: text.slice(0, 500) }
    }

    case 'checkbox': {
      const chosen = (Array.isArray(raw) ? raw : [raw]).map((entry) => String(entry ?? '').trim()).filter(Boolean)
      const allowed = optionValues(field)
      if (chosen.some((entry) => !allowed.includes(entry))) return { error: 'Please choose from the options shown.' }
      if (field.required && chosen.length === 0) return { error: `${labelled} is required.` }
      return { value: Array.from(new Set(chosen)) }
    }

    case 'date': {
      const text = String(raw).trim()
      return isRealDate(text) ? { value: text } : { error: 'Please enter a valid date.' }
    }

    case 'time': {
      const text = padTime(String(raw))
      return TIME_PATTERN.test(text) ? { value: text } : { error: 'Please enter a valid time.' }
    }

    case 'datetime': {
      const match = DATETIME_PATTERN.exec(String(raw).trim())
      if (!match || !isRealDate(match[1])) return { error: 'Please enter a valid date and time.' }
      return { value: `${match[1]}T${match[2]}:${match[3]}` }
    }

    case 'rating': {
      const max = Math.max(3, Math.min(10, Math.floor(field.scaleMax || 5)))
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 1 || n > max) return { error: `Please choose a rating from 1 to ${max}.` }
      return { value: n }
    }

    case 'nps': {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 0 || n > 10) return { error: 'Please choose a number from 0 to 10.' }
      return { value: n }
    }

    case 'signature': {
      const text = String(raw)
      if (text.length > MAX_SIGNATURE_BYTES || !SIGNATURE_PATTERN.test(text)) return { error: 'Please sign again.' }
      return { value: text }
    }

    case 'appointment':
      return validateAppointment(field, String(raw), now)

    default: {
      // text, textarea, phone, hidden.
      const text = clampText(raw)
      const trimmed = text.trim()
      const rules = field.validation
      if (rules?.minLength && trimmed.length < rules.minLength) return { error: `Please enter at least ${rules.minLength} characters.` }
      if (rules?.maxLength && trimmed.length > rules.maxLength) return { error: `Please use ${rules.maxLength} characters or fewer.` }
      const patternError = checkPattern(field, trimmed)
      if (patternError) return { error: patternError }
      return { value: text }
    }
  }
}

function validateAppointment(field: FormFieldDef, text: string, now: Date): FieldResult {
  const match = DATETIME_PATTERN.exec(text.trim().replace(/\s+/, ' '))
  if (!match || !isRealDate(match[1])) return { error: 'Please choose a day and a time.' }
  const date = match[1]
  const time = `${match[2]}:${match[3]}`

  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const weekdays = field.appointment?.weekdays?.length ? field.appointment.weekdays : [0, 1, 2, 3, 4, 5, 6]
  if (!weekdays.includes(weekday)) return { error: 'That day is not available.' }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const chosen = Date.UTC(year, month - 1, day)
  const daysAhead = (chosen - today) / 86_400_000
  const horizon = Math.max(1, Math.min(730, field.appointment?.daysAhead ?? 60))
  if (daysAhead < 0) return { error: 'That day has already passed.' }
  if (daysAhead > horizon) return { error: `Bookings open up to ${horizon} days ahead.` }

  const slots = appointmentSlots(field)
  if (slots.length > 0 && !slots.includes(time)) return { error: 'That time is not available.' }
  return { value: `${date} ${time}` }
}

function validateMatrix(field: FormFieldDef, raw: unknown, labelled: string): FieldResult {
  const rows = (field.rows || []).map((row) => String(row?.value ?? '').trim()).filter(Boolean)
  const columns = optionValues(field)
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const answers: Record<string, string> = {}
  for (const row of rows) {
    const picked = source[row]
    if (picked === undefined || picked === null || picked === '') continue
    const text = String(picked).trim()
    if (!columns.includes(text)) return { error: 'Please choose from the answers shown.' }
    answers[row] = text
  }
  if (Object.keys(answers).length === 0) {
    if (field.required) return { error: `${labelled} is required.` }
    return { value: undefined }
  }
  if (field.required && rows.some((row) => answers[row] === undefined)) return { error: 'Please answer every row.' }
  return { value: answers }
}

function validateAddress(field: FormFieldDef, raw: unknown, labelled: string): FieldResult {
  let source: Record<string, unknown> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) source = raw as Record<string, unknown>
  else if (typeof raw === 'string' && raw.trim()) source = { line1: raw }

  const cleaned: Record<string, string | number> = {}
  for (const key of ADDRESS_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) cleaned[key] = value.trim().slice(0, 200)
  }
  // Coordinates from a lookup are kept, but only as numbers within range.
  for (const key of ['lat', 'lon'] as const) {
    const n = Number(source[key])
    if (source[key] !== undefined && source[key] !== '' && Number.isFinite(n) && Math.abs(n) <= (key === 'lat' ? 90 : 180)) cleaned[key] = n
  }

  const hasAddress = Boolean(cleaned.line1 || cleaned.city || cleaned.postcode)
  if (!hasAddress) {
    if (field.required) return { error: `${labelled} is required.` }
    return { value: undefined }
  }
  if (field.required && (!cleaned.line1 || !cleaned.city)) return { error: 'Please enter the street and the town or city.' }
  return { value: cleaned }
}
