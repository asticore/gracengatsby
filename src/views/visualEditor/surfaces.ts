/** Which collections/globals the visual editor can open, and which field holds their blocks. */
export type SurfaceConfig = {
  kind: 'collection' | 'global'
  slug: string
  label: string
  blocksField: string
  titleField: string
}

export const VISUAL_EDITOR_SURFACES: Record<string, SurfaceConfig> = {
  pages: { kind: 'collection', slug: 'pages', label: 'Page', blocksField: 'blocks', titleField: 'title' },
  'page-templates': {
    kind: 'collection',
    slug: 'page-templates',
    label: 'Page Template',
    blocksField: 'blocks',
    titleField: 'name',
  },
  products: { kind: 'collection', slug: 'products', label: 'Product', blocksField: 'layout', titleField: 'title' },
  posts: { kind: 'collection', slug: 'posts', label: 'Post', blocksField: 'layout', titleField: 'title' },
  lessons: { kind: 'collection', slug: 'lessons', label: 'Lesson', blocksField: 'content', titleField: 'title' },
  'shop-settings': {
    kind: 'global',
    slug: 'shop-settings',
    label: 'Shop archive intro',
    blocksField: 'introBlocks',
    titleField: '',
  },
  'blog-settings': {
    kind: 'global',
    slug: 'blog-settings',
    label: 'Blog archive intro',
    blocksField: 'introBlocks',
    titleField: '',
  },
  'faq-settings': {
    kind: 'global',
    slug: 'faq-settings',
    label: 'FAQ / knowledge-base intro',
    blocksField: 'introBlocks',
    titleField: '',
  },
}