/**
 * The site template kinds and how the Templates dashboard groups them. Kept free of server imports so client
 * components and unit tests can use it; the collection (src/collections/SiteTemplates.ts) re-exports these.
 */
export const SITE_TEMPLATE_KINDS = [
  'header',
  'footer',
  'single-post',
  'single-product',
  'single-event',
  'archive-blog',
  'archive-shop',
  'not-found',
  'search-results',
  'archive-category',
  'archive-tag',
  'archive-author',
] as const

export type SiteTemplateKind = (typeof SITE_TEMPLATE_KINDS)[number]

export const KIND_LABELS: Record<SiteTemplateKind, string> = {
  header: 'Header',
  footer: 'Footer',
  'single-post': 'Single post',
  'single-product': 'Single product',
  'single-event': 'Single event',
  'archive-blog': 'Blog archive',
  'archive-shop': 'Shop archive',
  'not-found': '404 page',
  'search-results': 'Search results',
  'archive-category': 'Category archive',
  'archive-tag': 'Tag archive',
  'archive-author': 'Author archive',
}

/** Tabs of the Templates dashboard, Elementor Theme Builder style. Every kind belongs to exactly one tab. */
export const TEMPLATE_TYPE_TABS: ReadonlyArray<{ id: string; label: string; kinds: readonly SiteTemplateKind[] }> = [
  { id: 'header', label: 'Header', kinds: ['header'] },
  { id: 'footer', label: 'Footer', kinds: ['footer'] },
  { id: 'single', label: 'Single', kinds: ['single-post', 'single-product', 'single-event'] },
  { id: 'archive', label: 'Archive', kinds: ['archive-blog', 'archive-shop', 'archive-category', 'archive-tag', 'archive-author'] },
  { id: 'search', label: 'Search', kinds: ['search-results'] },
  { id: 'not-found', label: '404', kinds: ['not-found'] },
]

/**
 * Where a kind can be previewed on the public site, or null when there is no public page for it.
 * Single kinds have none: the visual builder's "Preview as" shows them with a sample item.
 */
export const PUBLIC_PREVIEW_PATH: Partial<Record<SiteTemplateKind, string>> = {
  header: '/',
  footer: '/',
  'archive-blog': '/blog',
  'archive-shop': '/shop',
  'search-results': '/search',
  'not-found': '/template-preview-not-found',
}
