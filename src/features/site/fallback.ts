/**
 * Fallback rules that fill blank invoice and search engine fields from Site details. Pure.
 * A value the feature already has always wins; Site details only fill what is blank.
 */
import type { SiteDetails } from './detailsModel'

type Details = Partial<SiteDetails> | null | undefined

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The first non-blank text (trimmed), or '' when every value is blank. */
export function firstFilled(...values: unknown[]): string {
  for (const value of values) {
    const text = trimmed(value)
    if (text) return text
  }
  return ''
}

/** A one-line postal address from the business details. Blank parts are skipped, and Australia is left out. */
export function postalAddressLine(details: Details): string {
  const cityLine = [details?.suburb, details?.state, details?.postcode].map(trimmed).filter(Boolean).join(' ')
  const country = trimmed(details?.country)
  return [trimmed(details?.streetAddress), cityLine, country && country !== 'Australia' ? country : ''].filter(Boolean).join(', ')
}

export type InvoiceStore = { name: string; abn: string | null; address: string | null; email: string | null }

/**
 * The store block printed on invoices. The shop's own tax fields come first; blank ones fall back to Site details,
 * and the name finally falls back to the site name.
 */
export function invoiceStoreFrom(
  shop: { businessName?: unknown; abn?: unknown; businessAddress?: unknown },
  siteName: unknown,
  details: Details,
): InvoiceStore {
  return {
    name: firstFilled(shop.businessName, details?.businessName, details?.legalName, siteName) || 'Shop',
    abn: firstFilled(shop.abn, details?.abn) || null,
    address: firstFilled(shop.businessAddress, postalAddressLine(details)) || null,
    email: firstFilled(details?.email) || null,
  }
}

/** The PostalAddress node for search engine data, or null when no address part is filled. */
export function postalAddressNode(details: Details): Record<string, string> | null {
  const node: Record<string, string> = {
    streetAddress: trimmed(details?.streetAddress),
    addressLocality: trimmed(details?.suburb),
    addressRegion: trimmed(details?.state),
    postalCode: trimmed(details?.postcode),
    addressCountry: trimmed(details?.country),
  }
  const filled = Object.entries(node).filter(([, value]) => value)
  if (filled.length === 0) return null
  return { '@type': 'PostalAddress', ...Object.fromEntries(filled) }
}

export type OrganisationContact = { telephone?: string; email?: string; address?: Record<string, string> }

/**
 * Contact fields for the organisation's search engine data. Values already in the SEO schema group win; Site details
 * only fill the gaps. A person has no business address, so none is added for one.
 */
export function organisationContact(
  schema: Record<string, unknown> | null | undefined,
  details: Details,
  type: string,
): OrganisationContact {
  const contact: OrganisationContact = {}
  const telephone = firstFilled(schema?.telephone, details?.phone)
  const email = firstFilled(schema?.email, details?.email)
  if (telephone) contact.telephone = telephone
  if (email) contact.email = email
  if (type !== 'person' && !schema?.address) {
    const address = postalAddressNode(details)
    if (address) contact.address = address
  }
  return contact
}
