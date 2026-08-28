/**
 * Public surface of the SEO feature.
 *
 * Every entry point here is a no-op when the `seo` feature toggle is off:
 * metadata comes back empty, components render null, and the robots/sitemap
 * builders return null. Callers therefore never need to check the flag.
 */

export { generateSeoMetadata, generateSeoMetadata as generateMetadata } from './metadata'
export { resolveSeo, applyTitleTemplate, type SeoInput, type ResolvedSeo } from './resolve'
export { buildJsonLd } from './jsonLd'
export { buildRobotsTxt } from './robots'
export {
  buildSitemapEntries,
  renderSitemapXml,
  type SitemapEntry,
  type ChangeFrequency,
} from './sitemap'
export {
  getSeoContext,
  getBaseUrl,
  type SeoContext,
  type DocumentSeo,
} from './settings'

export { SeoScripts, SeoBodyScripts } from './components/SeoScripts'
export { SeoJsonLd } from './components/SeoJsonLd'
export { CONSENT_STORAGE_KEY, CONSENT_EVENT, type ConsentValue } from './consent'
