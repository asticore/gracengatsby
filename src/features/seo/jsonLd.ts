import { absoluteUrl, mediaUrl, type SeoContext } from './settings'

type JsonLdNode = Record<string, unknown>

const SCHEMA_TYPES: Record<string, string> = {
  business: 'LocalBusiness',
  organisation: 'Organization',
  person: 'Person',
}

/**
 * Builds the structured-data graph search engines read to populate a knowledge
 * panel: who this site belongs to, its logo, and the profiles elsewhere that
 * are the same entity.
 *
 * Emitted as a `@graph` so the publisher node and the WebSite node can
 * cross-reference by `@id` instead of being repeated - which is what lets a
 * search engine tie an article back to its publisher.
 */
export const buildJsonLd = (context: SeoContext): JsonLdNode | null => {
  const schema = context.settings?.schema
  const name = schema?.organisationName?.trim() || context.siteName.trim()
  if (!name) return null

  const baseUrl = context.baseUrl
  const publisherId = `${baseUrl}/#identity`
  const logo = absoluteUrl(mediaUrl(schema?.logo), baseUrl)

  const sameAs = (schema?.sameAs || [])
    .map((entry) => entry?.url?.trim())
    .filter((url): url is string => Boolean(url))

  const publisher: JsonLdNode = {
    '@type': SCHEMA_TYPES[schema?.type || 'business'] || 'Organization',
    '@id': publisherId,
    name,
    url: `${baseUrl}/`,
  }

  if (logo) {
    // A Person has an `image`, not a `logo` - using the wrong one drops the
    // picture from the result entirely.
    publisher[publisher['@type'] === 'Person' ? 'image' : 'logo'] = {
      '@type': 'ImageObject',
      url: logo,
    }
  }
  if (sameAs.length > 0) publisher.sameAs = sameAs

  const website: JsonLdNode = {
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    url: `${baseUrl}/`,
    name: context.siteName || name,
    publisher: { '@id': publisherId },
  }

  const description = context.settings?.defaults?.metaDescription?.trim()
  if (description) website.description = description

  return { '@context': 'https://schema.org', '@graph': [publisher, website] }
}
