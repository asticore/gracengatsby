/**
 * Date and time formatting for the site, driven by Site details (see detailsModel.ts). Pure: Intl only, no
 * database and no request state, so it runs the same in the Worker, in the browser and in tests.
 *
 * With the default details (Sydney, "14 October 2026", 12-hour clock) the output matches what the event pages
 * printed before Site details existed, apart from the clock now following the chosen time zone.
 */
import { normalizeSiteDetails, type DateFormatKey, type SiteDetails } from './detailsModel'

type Input = Date | string | number | null | undefined
type Details = Partial<SiteDetails> | null | undefined
export type FormatOptions = { compact?: boolean }

const DATE_OPTIONS: Record<DateFormatKey, { locale: string; options: Intl.DateTimeFormatOptions }> = {
  dmy: { locale: 'en-AU', options: { day: 'numeric', month: 'short', year: 'numeric' } },
  long: { locale: 'en-AU', options: { day: 'numeric', month: 'long', year: 'numeric' } },
  numeric: { locale: 'en-AU', options: { day: '2-digit', month: '2-digit', year: 'numeric' } },
  mdy: { locale: 'en-US', options: { month: 'short', day: 'numeric', year: 'numeric' } },
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    formatters.set(key, formatter)
  }
  return formatter
}

/** A valid Date, or null for anything that is not a real date. */
export function toValidDate(input: Input): Date | null {
  if (input === null || input === undefined || input === '') return null
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The date options for a style. A compact date (event cards) swaps a full month for a short one. */
function dateOptionsFor(details: SiteDetails, options: FormatOptions): { locale: string; options: Intl.DateTimeFormatOptions } {
  const key: DateFormatKey = options.compact && details.dateFormat === 'long' ? 'dmy' : details.dateFormat
  return DATE_OPTIONS[key] ?? DATE_OPTIONS.long
}

const timeOptionsFor = (details: SiteDetails): Intl.DateTimeFormatOptions =>
  details.timeFormat === '24h'
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { hour: 'numeric', minute: '2-digit', hour12: true }

/** The calendar date, e.g. "14 October 2026" (default style). */
export function formatDate(input: Input, details?: Details, options: FormatOptions = {}): string {
  const date = toValidDate(input)
  if (!date) return ''
  const resolved = normalizeSiteDetails(details ?? null)
  const { locale, options: dateOptions } = dateOptionsFor(resolved, options)
  return formatterFor(locale, resolved.timezone, dateOptions).format(date)
}

/** The clock time only, e.g. "7:00 pm" (12-hour) or "19:00" (24-hour). */
export function formatTime(input: Input, details?: Details): string {
  const date = toValidDate(input)
  if (!date) return ''
  const resolved = normalizeSiteDetails(details ?? null)
  return formatterFor('en-AU', resolved.timezone, timeOptionsFor(resolved)).format(date)
}

/** Date and time together, e.g. "14 October 2026, 7:00 pm". The date style is the one in the details. */
export function formatDateTime(input: Input, details?: Details): string {
  const date = toValidDate(input)
  if (!date) return ''
  const resolved = normalizeSiteDetails(details ?? null)
  const { locale, options: dateOptions } = dateOptionsFor(resolved, {})
  return formatterFor(locale, resolved.timezone, { ...dateOptions, ...timeOptionsFor(resolved) }).format(date)
}
