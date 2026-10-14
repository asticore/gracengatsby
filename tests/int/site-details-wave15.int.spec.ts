// @vitest-environment node
// Site details (wave 15): the defaults, the normaliser, the date and time formatters, and the fallback rules for
// invoices and search engine data. Pure: no database, no engine.
import { describe, expect, it } from 'vitest'

import { normalizeSiteDetails, SITE_DETAILS_DEFAULTS, TIME_ZONE_OPTIONS } from '@/features/site/detailsModel'
import { formatDate, formatDateTime, formatTime } from '@/features/site/format'
import { firstFilled, invoiceStoreFrom, organisationContact, postalAddressLine, postalAddressNode } from '@/features/site/fallback'

// 03:00 UTC on 14 October 2026 is 2:00 pm in Sydney (AEDT, UTC+11).
const SAMPLE = new Date('2026-10-14T03:00:00Z')

describe('site details defaults and normaliser', () => {
  it('gives the defaults when there is no row', () => {
    expect(normalizeSiteDetails(null)).toEqual(SITE_DETAILS_DEFAULTS)
    expect(normalizeSiteDetails(undefined)).toEqual(SITE_DETAILS_DEFAULTS)
    expect(SITE_DETAILS_DEFAULTS).toMatchObject({ timezone: 'Australia/Sydney', dateFormat: 'long', timeFormat: '12h', country: 'Australia' })
  })

  it('keeps known choices and falls back on unknown ones', () => {
    const doc = normalizeSiteDetails({ timezone: 'Europe/London', dateFormat: 'mdy', timeFormat: '24h' })
    expect(doc).toMatchObject({ timezone: 'Europe/London', dateFormat: 'mdy', timeFormat: '24h' })
    const bad = normalizeSiteDetails({ timezone: 'Mars/Olympus', dateFormat: 'iso', timeFormat: '13h' })
    expect(bad).toMatchObject({ timezone: 'Australia/Sydney', dateFormat: 'long', timeFormat: '12h' })
  })

  it('reads the business group, trims text, and keeps a blank country blank', () => {
    const doc = normalizeSiteDetails({
      business: { businessName: '  Grace Co  ', abn: null, country: '  ', website: 'https://example.com.au', openingHours: 'Mon 9-5' },
    })
    expect(doc.businessName).toBe('Grace Co')
    expect(doc.abn).toBe('')
    expect(doc.country).toBe('')
    expect(doc.website).toBe('https://example.com.au')
    expect(doc.openingHours).toBe('Mon 9-5')
  })

  it('drops a website that is not a full http(s) address', () => {
    expect(normalizeSiteDetails({ business: { website: 'example.com' } }).website).toBe('')
    expect(normalizeSiteDetails({ business: { website: 'javascript:alert(1)' } }).website).toBe('')
  })

  it('offers the default zone and only ASCII-safe zone values', () => {
    const values = TIME_ZONE_OPTIONS.map((option) => option.value)
    expect(values).toContain('Australia/Sydney')
    expect(new Set(values).size).toBe(values.length)
    expect(values.every((value) => /^[A-Za-z_/]+$/.test(value))).toBe(true)
  })
})

describe('date and time formatters', () => {
  it('reproduces the old event output with the default details', () => {
    // Old event card: en-AU, short month, Sydney time. Old event page: en-AU, long month, with a clock time.
    const oldCard = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }).format(SAMPLE)
    expect(formatDate(SAMPLE, null, { compact: true })).toBe(oldCard)
    expect(formatDate(SAMPLE, null, { compact: true })).toBe('14 Oct 2026')
    expect(formatDate(SAMPLE)).toBe('14 October 2026')
  })

  it('writes each date style', () => {
    expect(formatDate(SAMPLE, { dateFormat: 'dmy' })).toBe('14 Oct 2026')
    expect(formatDate(SAMPLE, { dateFormat: 'numeric' })).toBe('14/10/2026')
    expect(formatDate(SAMPLE, { dateFormat: 'mdy' })).toBe('Oct 14, 2026')
  })

  it('compact cards swap a full month for a short one, and leave the other styles alone', () => {
    expect(formatDate(SAMPLE, { dateFormat: 'long' }, { compact: true })).toBe('14 Oct 2026')
    expect(formatDate(SAMPLE, { dateFormat: 'numeric' }, { compact: true })).toBe('14/10/2026')
  })

  it('uses the chosen time zone for the day and the clock', () => {
    expect(formatDate(new Date('2026-10-13T20:00:00Z'), { timezone: 'Australia/Sydney' })).toBe('14 October 2026')
    expect(formatDate(new Date('2026-10-13T20:00:00Z'), { timezone: 'UTC' })).toBe('13 October 2026')
    expect(formatTime(SAMPLE, { timezone: 'UTC' })).toMatch(/3:00\s?am/i)
  })

  it('shows a 12-hour or 24-hour clock', () => {
    expect(formatTime(SAMPLE, null)).toMatch(/^2:00\s?pm$/i)
    expect(formatTime(SAMPLE, { timeFormat: '24h' })).toBe('14:00')
  })

  it('joins the date and the time, and follows the date style', () => {
    expect(formatDateTime(SAMPLE, null)).toMatch(/^14 October 2026(,| at) 2:00\s?pm$/i)
    expect(formatDateTime(SAMPLE, { dateFormat: 'numeric', timeFormat: '24h' })).toMatch(/^14\/10\/2026,? 14:00$/)
  })

  it('returns an empty string for a missing or invalid date', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('')
    expect(formatTime(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
  })
})

describe('fallback rules', () => {
  it('takes the first filled value', () => {
    expect(firstFilled('', '  ', null, ' Shop ', 'Later')).toBe('Shop')
    expect(firstFilled(undefined, '')).toBe('')
  })

  it('builds a one-line address, leaving out blanks and Australia', () => {
    expect(postalAddressLine({ streetAddress: '1 Shop Lane', suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'Australia' })).toBe('1 Shop Lane, Sydney NSW 2000')
    expect(postalAddressLine({ suburb: 'Auckland', country: 'New Zealand' })).toBe('Auckland, New Zealand')
    expect(postalAddressLine(null)).toBe('')
  })

  it('fills the invoice store from the business details only where the shop is blank', () => {
    const details = normalizeSiteDetails({
      business: { businessName: 'Details Name', abn: '11 222 333 444', streetAddress: '1 Shop Lane', suburb: 'Sydney', state: 'NSW', postcode: '2000', email: 'hi@example.com' },
    })
    expect(invoiceStoreFrom({ businessName: 'Shop Co', abn: '', businessAddress: '' }, 'Site', details)).toEqual({
      name: 'Shop Co',
      abn: '11 222 333 444',
      address: '1 Shop Lane, Sydney NSW 2000',
      email: 'hi@example.com',
    })
    expect(invoiceStoreFrom({ businessAddress: '9 Other St' }, 'Site', details).address).toBe('9 Other St')
    expect(invoiceStoreFrom({}, 'Site', null)).toEqual({ name: 'Site', abn: null, address: null, email: null })
    expect(invoiceStoreFrom({}, '', null).name).toBe('Shop')
  })

  it('builds a postal address node only when a part is filled', () => {
    expect(postalAddressNode({ suburb: 'Sydney', country: 'Australia' })).toEqual({ '@type': 'PostalAddress', addressLocality: 'Sydney', addressCountry: 'Australia' })
    expect(postalAddressNode(normalizeSiteDetails({ business: { country: '' } }))).toBeNull()
  })

  it('fills phone, email and address only where the SEO schema group is blank', () => {
    const details = normalizeSiteDetails({ business: { phone: '02 9000 0000', email: 'hi@example.com', suburb: 'Sydney' } })
    expect(organisationContact({}, details, 'business')).toEqual({
      telephone: '02 9000 0000',
      email: 'hi@example.com',
      address: { '@type': 'PostalAddress', addressLocality: 'Sydney', addressCountry: 'Australia' },
    })
    // The schema's own telephone and email win, and its own address stops the Site details address being added.
    expect(organisationContact({ telephone: '1300 000 000', email: 'seo@example.com', address: { streetAddress: 'x' } }, details, 'organisation')).toEqual({
      telephone: '1300 000 000',
      email: 'seo@example.com',
    })
  })

  it('adds no address for a person, and nothing when Site details are missing', () => {
    const details = normalizeSiteDetails({ business: { phone: '0400 000 000', suburb: 'Sydney' } })
    expect(organisationContact(undefined, details, 'person')).toEqual({ telephone: '0400 000 000' })
    expect(organisationContact(undefined, null, 'business')).toEqual({})
  })
})
