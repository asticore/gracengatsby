/**
 * Site details: the business identity, the time zone, and the date and clock formats the site shows.
 * Pure (no imports, no database). The global config, the loader, the formatters and the tests all read
 * these defaults and this normaliser, so a missing row or value means the same thing everywhere.
 */

export type DateFormatKey = 'dmy' | 'long' | 'numeric' | 'mdy'
export type TimeFormatKey = '12h' | '24h'

export type SiteDetails = {
  timezone: string
  dateFormat: DateFormatKey
  timeFormat: TimeFormatKey
  businessName: string
  legalName: string
  abn: string
  phone: string
  email: string
  website: string
  streetAddress: string
  suburb: string
  state: string
  postcode: string
  country: string
  openingHours: string
}

export const SITE_DETAILS_DEFAULTS: SiteDetails = {
  timezone: 'Australia/Sydney',
  dateFormat: 'long',
  timeFormat: '12h',
  businessName: '',
  legalName: '',
  abn: '',
  phone: '',
  email: '',
  website: '',
  streetAddress: '',
  suburb: '',
  state: '',
  postcode: '',
  country: 'Australia',
  openingHours: '',
}

export const TIME_ZONE_OPTIONS: { label: string; value: string }[] = [
  { label: 'New Zealand: Auckland, Wellington', value: 'Pacific/Auckland' },
  { label: 'Australia Eastern: Sydney, Melbourne, Canberra', value: 'Australia/Sydney' },
  { label: 'Australia Eastern, no daylight saving: Brisbane', value: 'Australia/Brisbane' },
  { label: 'Australia Central: Adelaide', value: 'Australia/Adelaide' },
  { label: 'Australia Central, no daylight saving: Darwin', value: 'Australia/Darwin' },
  { label: 'Australia Western: Perth', value: 'Australia/Perth' },
  { label: 'Tasmania: Hobart', value: 'Australia/Hobart' },
  { label: 'Japan: Tokyo', value: 'Asia/Tokyo' },
  { label: 'South Korea: Seoul', value: 'Asia/Seoul' },
  { label: 'Hong Kong', value: 'Asia/Hong_Kong' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'India: Kolkata, Mumbai, New Delhi', value: 'Asia/Kolkata' },
  { label: 'United Arab Emirates: Dubai', value: 'Asia/Dubai' },
  { label: 'Egypt: Cairo', value: 'Africa/Cairo' },
  { label: 'South Africa: Johannesburg', value: 'Africa/Johannesburg' },
  { label: 'Nigeria: Lagos', value: 'Africa/Lagos' },
  { label: 'Russia: Moscow', value: 'Europe/Moscow' },
  { label: 'Greece: Athens', value: 'Europe/Athens' },
  { label: 'France, Germany, Italy: Paris, Berlin, Rome', value: 'Europe/Paris' },
  { label: 'Ireland: Dublin', value: 'Europe/Dublin' },
  { label: 'United Kingdom: London', value: 'Europe/London' },
  { label: 'Brazil: Sao Paulo', value: 'America/Sao_Paulo' },
  { label: 'Mexico: Mexico City', value: 'America/Mexico_City' },
  { label: 'US Eastern: New York', value: 'America/New_York' },
  { label: 'US Central: Chicago', value: 'America/Chicago' },
  { label: 'US Mountain: Denver', value: 'America/Denver' },
  { label: 'US Pacific: Los Angeles', value: 'America/Los_Angeles' },
  { label: 'Alaska: Anchorage', value: 'America/Anchorage' },
  { label: 'Hawaii: Honolulu', value: 'Pacific/Honolulu' },
  { label: 'UTC (no offset)', value: 'UTC' },
]

export const DATE_FORMAT_OPTIONS: { label: string; value: DateFormatKey }[] = [
  { label: 'Day, short month, year (14 Oct 2026)', value: 'dmy' },
  { label: 'Day, full month, year (14 October 2026)', value: 'long' },
  { label: 'Numbers, day first (14/10/2026)', value: 'numeric' },
  { label: 'Short month, day, year (Oct 14, 2026)', value: 'mdy' },
]

export const TIME_FORMAT_OPTIONS: { label: string; value: TimeFormatKey }[] = [
  { label: '12-hour clock (7:00 pm)', value: '12h' },
  { label: '24-hour clock (19:00)', value: '24h' },
]

const TEXT_LIMIT = 300
const OPENING_HOURS_LIMIT = 1000

const timeZoneValues = TIME_ZONE_OPTIONS.map((option) => option.value)
const dateFormatValues: string[] = DATE_FORMAT_OPTIONS.map((option) => option.value)
const timeFormatValues: string[] = TIME_FORMAT_OPTIONS.map((option) => option.value)

const text = (value: unknown, limit = TEXT_LIMIT): string => (typeof value === 'string' ? value.trim().slice(0, limit) : '')

const oneOf = (value: unknown, allowed: string[], fallback: string): string =>
  typeof value === 'string' && allowed.includes(value) ? value : fallback

/**
 * Turns whatever the database returned into a complete, safe SiteDetails. A missing row, a null column or an
 * unknown choice all fall back to the default. Text is trimmed and capped, and the website must be a full
 * http(s) address before it is used anywhere.
 */
export function normalizeSiteDetails(doc: unknown): SiteDetails {
  const root = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>
  const business = (root.business && typeof root.business === 'object' ? root.business : {}) as Record<string, unknown>
  const d = SITE_DETAILS_DEFAULTS
  const website = text(business.website)
  return {
    timezone: oneOf(root.timezone, timeZoneValues, d.timezone),
    dateFormat: oneOf(root.dateFormat, dateFormatValues, d.dateFormat) as DateFormatKey,
    timeFormat: oneOf(root.timeFormat, timeFormatValues, d.timeFormat) as TimeFormatKey,
    businessName: text(business.businessName),
    legalName: text(business.legalName),
    abn: text(business.abn),
    phone: text(business.phone),
    email: text(business.email),
    website: /^https?:\/\/\S+$/i.test(website) ? website : '',
    streetAddress: text(business.streetAddress),
    suburb: text(business.suburb),
    state: text(business.state),
    postcode: text(business.postcode),
    country: typeof business.country === 'string' ? text(business.country) : d.country,
    openingHours: text(business.openingHours, OPENING_HOURS_LIMIT),
  }
}
