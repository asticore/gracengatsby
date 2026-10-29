import { normaliseHost } from './host'
import { isKnownLocale } from '@/features/multilingual/locales'

/**
 * The domain registry as the rest of the app reads it. Pure: the admin validation, the edge
 * middleware, the SEO builders and the tests share these rules.
 *
 * Header names are set only by src/features/domains/middleware.ts, which first removes any copy the
 * client sent, so nothing downstream can be told a host or a language it did not get from the registry.
 */

/** The matched, active host of the request (`example.com.au`). Absent for unknown hosts. */
export const DOMAIN_HEADER = 'x-eg-domain'
/** The language a domain serves without a prefix, when the visitor has no locale cookie and no prefix. */
export const DOMAIN_LOCALE_HEADER = 'x-eg-domain-locale'

export type DomainStatus = 'active' | 'disabled'

/**
 * Per-domain overrides. Each is null when the domain uses the site-wide value. The public header, footer,
 * site title and SEO read these when the request arrived on this domain (features/domains/request.ts).
 */
export type DomainOverrides = {
  siteName: string | null
  tagline: string | null
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  socials: { instagram: string | null; facebook: string | null; linkedin: string | null; x: string | null }
}

export const NO_OVERRIDES: DomainOverrides = {
  siteName: null,
  tagline: null,
  logoUrl: null,
  contactEmail: null,
  contactPhone: null,
  socials: { instagram: null, facebook: null, linkedin: null, x: null },
}

/** One configured domain, after normalisation. */
export type SiteDomain = {
  overrides: DomainOverrides
  host: string
  label: string
  /** Language served unprefixed on this domain. Null inherits the site's primary language. */
  defaultLocale: string | null
  /** Store only: a display currency hint. Shoppers still pay in the shop currency until currency wiring exists. */
  currencyHint: string | null
  isPrimary: boolean
  status: DomainStatus
  redirectToPrimary: boolean
  allowAdmin: boolean
}

/** The stored row shape (the global's array items), before normalisation. Values are untrusted. */
export type DomainRow = Partial<Record<keyof Omit<SiteDomain, 'status' | 'overrides'> | 'status' | OverrideKey, unknown>>

type OverrideKey = 'siteName' | 'tagline' | 'logoUrl' | 'contactEmail' | 'contactPhone' | 'instagramUrl' | 'facebookUrl' | 'linkedinUrl' | 'xUrl'

export type NormalisedDomains = { domains: SiteDomain[]; errors: string[] }

const CURRENCY = /^[A-Z]{3}$/

const asFlag = (value: unknown, fallback: boolean): boolean => {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
  return Boolean(Number(value) || value === true)
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Reads one override. Empty is null. Returns an error message as well when the value cannot be used. */
function override(value: unknown, max: number): { value: string | null; error?: string } {
  const text = asText(value)
  if (!text) return { value: null }
  return text.length > max ? { value: null, error: `An override is longer than ${max} characters.` } : { value: text }
}

function secureUrl(value: unknown, label: string, allowPath: boolean): { value: string | null; error?: string } {
  const text = asText(value)
  if (!text) return { value: null }
  const https = /^https:\/\/[^\s]+$/i.test(text)
  const path = allowPath && /^\/[^\s/][^\s]*$/.test(text)
  return https || path ? { value: text } : { value: null, error: `${label} must start with https:// ${allowPath ? 'or be a path such as /logo.svg' : ''}`.trim() }
}

/**
 * Validates and normalises the rows of the domain registry.
 *
 * Blank rows are dropped. Invalid, duplicated and unknown-language rows are reported in `errors`.
 * Exactly one primary is required among the rows, and the primary must be active. `activeLocales`
 * (the enabled website languages) is optional: when given, a domain language outside it is an error.
 */
export function normaliseDomains(rows: unknown, activeLocales?: readonly string[]): NormalisedDomains {
  const errors: string[] = []
  if (!Array.isArray(rows)) return { domains: [], errors }

  const domains: SiteDomain[] = []
  const seen = new Set<string>()

  for (const raw of rows as DomainRow[]) {
    if (!raw || typeof raw !== 'object') continue
    const hostInput = asText(raw.host)
    const label = asText(raw.label)
    if (!hostInput && !label) continue

    const parsed = normaliseHost(hostInput)
    if (parsed.ok === false) {
      errors.push(parsed.reason)
      continue
    }
    if (seen.has(parsed.host)) {
      errors.push(`${parsed.host} is listed more than once.`)
      continue
    }
    seen.add(parsed.host)

    const locale = asText(raw.defaultLocale)
    let defaultLocale: string | null = null
    if (locale) {
      const known = isKnownLocale(locale) ? locale : null
      const enabled = !activeLocales || (known !== null && activeLocales.includes(known))
      if (known && enabled) defaultLocale = known
      else errors.push(`${parsed.host}: the language ${locale} is not one of the enabled website languages.`)
    }

    const currency = asText(raw.currencyHint).toUpperCase()
    if (currency && !CURRENCY.test(currency)) errors.push(`${parsed.host}: the currency must be a three-letter code such as AUD.`)

    const errorsHere: string[] = []
    const take = (r: { value: string | null; error?: string }) => {
      if (r.error) errorsHere.push(`${parsed.host}: ${r.error}`)
      return r.value
    }
    const email = take(override(raw.contactEmail, 200))
    if (email && !EMAIL.test(email)) errorsHere.push(`${parsed.host}: the contact email is not a valid address.`)
    const overrides: DomainOverrides = {
      siteName: take(override(raw.siteName, 120)),
      tagline: take(override(raw.tagline, 200)),
      logoUrl: take(secureUrl(raw.logoUrl, 'The logo URL', true)),
      contactEmail: email,
      contactPhone: take(override(raw.contactPhone, 40)),
      socials: {
        instagram: take(secureUrl(raw.instagramUrl, 'The Instagram URL', false)),
        facebook: take(secureUrl(raw.facebookUrl, 'The Facebook URL', false)),
        linkedin: take(secureUrl(raw.linkedinUrl, 'The LinkedIn URL', false)),
        x: take(secureUrl(raw.xUrl, 'The X URL', false)),
      },
    }
    errors.push(...errorsHere)

    domains.push({
      overrides,
      host: parsed.host,
      label: label || parsed.host,
      defaultLocale,
      currencyHint: currency && CURRENCY.test(currency) ? currency : null,
      isPrimary: asFlag(raw.isPrimary, false),
      status: raw.status === 'disabled' ? 'disabled' : 'active',
      redirectToPrimary: asFlag(raw.redirectToPrimary, false),
      allowAdmin: asFlag(raw.allowAdmin, true),
    })
  }

  if (domains.length > 0) {
    const primaries = domains.filter((domain) => domain.isPrimary)
    if (primaries.length !== 1) errors.push('Choose exactly one primary domain.')
    else if (primaries[0].status !== 'active') errors.push('The primary domain must be active.')
  }

  return { domains, errors }
}

/**
 * The primary domain of an already-normalised list: the one flagged primary and active. Null when there is none.
 * Used at request time, where a broken registry must degrade to "no redirects" rather than fail.
 */
export function primaryOf(domains: readonly SiteDomain[]): SiteDomain | null {
  return domains.find((domain) => domain.isPrimary && domain.status === 'active') ?? null
}

/** The active domain whose host equals `host` (already lower-cased), or null. */
export function matchDomain(host: string, domains: readonly SiteDomain[]): SiteDomain | null {
  if (!host) return null
  return domains.find((domain) => domain.status === 'active' && domain.host === host) ?? null
}

/** Admin paths: never locale-prefixed, always reachable on the primary domain. */
export const isAdminPath = (pathname: string): boolean => pathname === '/admin' || pathname.startsWith('/admin/')
