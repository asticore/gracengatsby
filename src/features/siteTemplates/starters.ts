import { getElementDef } from '@/lib/elements/registry'
import { paragraph } from '@/lib/elements/wave26Defs'
import type { SectionNode } from '@/lib/sectionTree'

import type { SiteTemplateKind } from '@/collections/SiteTemplates'

export type TemplateStarter = {
  id: string
  kind: SiteTemplateKind
  label: string
  description: string
  /** The template's `blocks` value: a list of section nodes, built only from registered elements. */
  blocks: () => SectionNode[]
}

/** An `element` node built from the element's own defaults with a few props overridden. */
const el = (elementType: string, props: Record<string, unknown> = {}): SectionNode => ({
  blockType: 'element',
  elementType,
  props: { ...(getElementDef(elementType)?.defaultProps() || {}), ...props },
})

const section = (blocks: SectionNode[], design?: Record<string, unknown>): SectionNode => ({
  blockType: 'section',
  ...(design ? { design } : {}),
  columns: [{ width: 12, blocks }],
})

const heading = (text: string, tag = 'h1') => el('heading', { text, tag, align: 'center' })
const copy = (text: string) => el('text-editor', { align: 'center', content: paragraph(text) })

export const STARTERS: TemplateStarter[] = [
  {
    id: 'single-post-classic',
    kind: 'single-post',
    label: 'Classic post',
    description: 'Breadcrumbs, title, meta, featured image, then the post content.',
    blocks: () => [
      section([el('auto-breadcrumbs'), el('post-title', { level: 'h1' }), el('post-meta'), el('post-featured-image'), el('content-slot')]),
    ],
  },
  {
    id: 'single-post-minimal',
    kind: 'single-post',
    label: 'Minimal post',
    description: 'Title and content only.',
    blocks: () => [section([el('post-title', { level: 'h1' }), el('content-slot')])],
  },
  {
    id: 'loop-blog-card',
    kind: 'loop',
    label: 'Blog card',
    description: 'For the Loop grid: featured picture, title, meta and excerpt of each post.',
    blocks: () => [section([el('post-featured-image'), el('post-title', { level: 'h3' }), el('post-meta'), el('post-excerpt')])],
  },
  {
    id: 'loop-product-card',
    kind: 'loop',
    label: 'Product card',
    description: 'For the Loop grid: picture, title and price of each product.',
    blocks: () => [section([el('post-featured-image'), el('post-title', { level: 'h3' }), el('product-price')])],
  },
  {
    id: 'single-product-classic',
    kind: 'single-product',
    label: 'Classic product',
    description: 'Breadcrumbs, title, price, then the product content.',
    blocks: () => [section([el('auto-breadcrumbs'), el('post-title', { level: 'h1' }), el('product-price'), el('content-slot')])],
  },
  {
    id: 'single-event-classic',
    kind: 'single-event',
    label: 'Classic event',
    description: 'Breadcrumbs, title, featured image, then the event content.',
    blocks: () => [section([el('auto-breadcrumbs'), el('post-title', { level: 'h1' }), el('post-featured-image'), el('content-slot')])],
  },
  {
    id: 'archive-blog-simple',
    kind: 'archive-blog',
    label: 'Blog archive',
    description: 'A heading above the list of posts.',
    blocks: () => [section([heading('Blog')]), section([el('content-slot')])],
  },
  {
    id: 'archive-shop-simple',
    kind: 'archive-shop',
    label: 'Shop archive',
    description: 'A heading above the product list.',
    blocks: () => [section([heading('Shop')]), section([el('content-slot')])],
  },
  {
    id: 'search-results-simple',
    kind: 'search-results',
    label: 'Search results',
    description: 'A heading above the search form and results.',
    blocks: () => [section([heading('Search')]), section([el('content-slot')])],
  },
  {
    id: 'archive-category-simple',
    kind: 'archive-category',
    label: 'Category archive',
    description: 'A heading above the category post list.',
    blocks: () => [section([heading('Category')]), section([el('content-slot')])],
  },
  {
    id: 'archive-tag-simple',
    kind: 'archive-tag',
    label: 'Tag archive',
    description: 'A heading above the tagged post list.',
    blocks: () => [section([heading('Tag')]), section([el('content-slot')])],
  },
  {
    id: 'archive-author-simple',
    kind: 'archive-author',
    label: 'Author archive',
    description: 'A heading above the author post list.',
    blocks: () => [section([heading('Author')]), section([el('content-slot')])],
  },
  {
    id: 'not-found-friendly',
    kind: 'not-found',
    label: 'Friendly 404',
    description: 'A heading, a short message and a button home.',
    blocks: () => [
      section([heading('Page not found'), copy('Sorry, we could not find that page. It may have moved or no longer exists.'), el('button', { text: 'Back to home', url: '/', variant: 'primary', align: 'center' })]),
    ],
  },
  {
    id: 'header-logo-menu',
    kind: 'header',
    label: 'Logo and menu',
    description: 'Site logo on the left, main menu on the right.',
    blocks: () => [
      {
        blockType: 'section',
        columns: [
          { width: 4, blocks: [el('site-logo')] },
          { width: 8, blocks: [el('nav-menu')] },
        ],
      },
    ],
  },
  {
    id: 'footer-text-menu',
    kind: 'footer',
    label: 'Text and menu',
    description: 'A short line of text above the menu.',
    blocks: () => [section([copy('Thanks for visiting.'), el('nav-menu')])],
  },
]

export const getStarter = (id: unknown): TemplateStarter | undefined => STARTERS.find((s) => s.id === id)
