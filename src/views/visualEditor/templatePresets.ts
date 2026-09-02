import type { SectionNode } from '@/lib/sectionTree'

/**
 * Curated multi-block starting points ("Hero + features + CTA", etc.) -
 * these aren't stored anywhere, they're just a shorthand for dropping a
 * handful of blocks at once instead of one at a time. Alongside the
 * "Templates" source tab in the element library also lists the real Page
 * Templates collection (see TemplateLibrary.tsx), which IS admin-editable;
 * these presets are the "start from a real layout" option that doesn't
 * require anyone to have built a Page Template first.
 *
 * Every block here is a bare object built from the same shape the block
 * schemas' own `defaultValue()` produces - ElementLibrary runs each through
 * `cloneNode` before inserting, which assigns real ids, so none are set here.
 */
export type TemplatePreset = {
  slug: string
  name: string
  description: string
  blocks: () => SectionNode[]
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    slug: 'hero-simple',
    name: 'Simple hero',
    description: 'Heading, subheading, one button.',
    blocks: () => [
      {
        blockType: 'hero',
        heading: 'New heading',
        subheading: 'Add a line of supporting copy here.',
        primaryCtaLabel: 'Learn more',
        primaryCtaUrl: '/',
      },
    ],
  },
  {
    slug: 'hero-story-cta',
    name: 'Hero + story + CTA',
    description: 'Hero banner, an image-and-text section, and a call-to-action banner.',
    blocks: () => [
      {
        blockType: 'hero',
        heading: 'New heading',
        subheading: 'Add a line of supporting copy here.',
        primaryCtaLabel: 'Shop now',
        primaryCtaUrl: '/shop',
      },
      {
        blockType: 'imageText',
        imageSide: 'left',
        content: undefined,
      },
      {
        blockType: 'ctaBanner',
        heading: 'New call to action',
        style: 'dark',
        buttonLabel: 'Get started',
        buttonUrl: '/',
      },
    ],
  },
  {
    slug: 'three-up-features',
    name: 'Three-column features',
    description: 'A section with three equal columns, each with a rich text block to fill in.',
    blocks: () => [
      {
        blockType: 'section',
        columns: [
          { width: 4, blocks: [{ blockType: 'richText' }] },
          { width: 4, blocks: [{ blockType: 'richText' }] },
          { width: 4, blocks: [{ blockType: 'richText' }] },
        ],
      },
    ],
  },
  {
    slug: 'gallery-cta',
    name: 'Gallery + CTA',
    description: 'An image gallery followed by a call-to-action banner.',
    blocks: () => [
      { blockType: 'gallery', heading: 'Gallery', images: [] },
      { blockType: 'ctaBanner', heading: 'New call to action', style: 'light' },
    ],
  },
  {
    slug: 'shop-landing',
    name: 'Shop landing',
    description: 'Hero, product grid, and a newsletter CTA - a common landing-page shape.',
    blocks: () => [
      { blockType: 'hero', heading: 'Shop the collection', primaryCtaLabel: 'Browse all', primaryCtaUrl: '/shop' },
      { blockType: 'productGrid', heading: 'Shop', limit: 8 },
      { blockType: 'ctaBanner', heading: 'Join the list', style: 'dark', buttonLabel: 'Sign up' },
    ],
  },
]