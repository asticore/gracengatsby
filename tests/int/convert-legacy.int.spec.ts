import { describe, expect, it } from 'vitest'

import { canConvertLegacy, convertLegacyBlock } from '@/views/visualEditor/convertLegacy'

type TestNode = {
  blockType: string
  elementType?: string
  props?: Record<string, unknown>
  design?: Record<string, unknown>
  columns?: { blocks?: TestNode[] }[]
}

/** Every block nested anywhere under a node (columns, sections inside columns, ...). */
function descendants(node: TestNode): TestNode[] {
  return (node.columns ?? []).flatMap((column) => (column.blocks ?? []).flatMap((child) => [child, ...descendants(child)]))
}

/** All non-empty string values in a legacy block, at any depth. Enum keys are skipped: they become layout or colour, not copy. */
const NON_CONTENT_KEYS = new Set(['blockType', 'style', 'imageSide'])
function stringValues(value: unknown, key = '', out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value !== '' && !NON_CONTENT_KEYS.has(key)) out.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) stringValues(item, key, out)
  } else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) stringValues(child, childKey, out)
  }
  return out
}

const richText = (text: string) => ({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 }] }],
  },
})

const HERO = {
  blockType: 'hero',
  heading: 'Welcome home',
  subheading: 'Handmade goods, made to last',
  backgroundImage: 42,
  primaryCtaLabel: 'Shop now',
  primaryCtaUrl: '/shop',
  secondaryCtaLabel: 'Our story',
  secondaryCtaUrl: '/about',
}

const CTA_BANNER = {
  blockType: 'ctaBanner',
  heading: 'Join the list',
  text: 'News and offers, now and then.',
  buttonLabel: 'Sign up',
  buttonUrl: '/signup',
  style: 'light',
}

const IMAGE_TEXT = {
  blockType: 'imageText',
  image: { id: 7, url: 'https://cdn.example.com/vase.jpg', alt: 'A hand-thrown vase' },
  content: richText('Thrown on the wheel in small batches.'),
  imageSide: 'right',
}

const GALLERY = {
  blockType: 'gallery',
  heading: 'Recent work',
  images: [3, 4, { url: 'https://cdn.example.com/extra.jpg', alt: 'Extra piece' }],
}

describe('canConvertLegacy', () => {
  it('is true for the four legacy monolith types and false for everything else', () => {
    for (const type of ['hero', 'ctaBanner', 'imageText', 'gallery']) expect(canConvertLegacy(type)).toBe(true)
    for (const type of ['section', 'richText', 'element', 'productGrid', '']) expect(canConvertLegacy(type)).toBe(false)
  })
})

describe('convertLegacyBlock', () => {
  it('returns null for an unsupported block type', () => {
    expect(convertLegacyBlock({ blockType: 'richText', content: 'Hello' })).toBeNull()
    expect(convertLegacyBlock({ blockType: 'productGrid', heading: 'Shop' })).toBeNull()
    expect(convertLegacyBlock({ heading: 'No type at all' })).toBeNull()
  })

  it('turns a hero into a section with an h1, the subheading, both buttons and the background image id', () => {
    const out = convertLegacyBlock(HERO) as TestNode
    expect(out.blockType).toBe('section')
    expect(out.design?.bgType).toBe('image')
    expect(out.design?.bgImage).toBe(42)

    const nodes = descendants(out)
    const h1 = nodes.find((n) => n.elementType === 'heading' && n.props?.tag === 'h1')
    expect(h1?.props?.text).toBe('Welcome home')

    const primary = nodes.find((n) => n.elementType === 'button' && n.props?.url === '/shop')
    expect(primary?.props?.text).toBe('Shop now')
    expect(primary?.props?.variant).toBe('primary')

    const secondary = nodes.find((n) => n.elementType === 'button' && n.props?.url === '/about')
    expect(secondary?.props?.variant).toBe('secondary')

    const sub = nodes.find((n) => n.elementType === 'text-editor')
    expect(JSON.stringify(sub?.props?.content)).toContain('Handmade goods, made to last')
  })

  it('carries the anchor id and valid design keys from the legacy block onto the section', () => {
    const out = convertLegacyBlock({ ...HERO, design: { anchorId: 'intro', paddingTop: 12 } }) as TestNode
    expect(out.design?.anchorId).toBe('intro')
    expect(out.design?.paddingTop).toBe(12)
  })

  it('turns a CTA banner into a centred section with an h2, text and a button', () => {
    const out = convertLegacyBlock(CTA_BANNER) as TestNode
    const nodes = descendants(out)
    expect(nodes.find((n) => n.elementType === 'heading')?.props).toMatchObject({ text: 'Join the list', tag: 'h2' })
    expect(nodes.find((n) => n.elementType === 'button')?.props).toMatchObject({ text: 'Sign up', url: '/signup' })
    expect(out.design?.bgColor).toBe('#f3f4f6')
  })

  it('turns image + text into two columns with the picture on the side the block asks for', () => {
    const out = convertLegacyBlock(IMAGE_TEXT) as TestNode
    const columns = out.columns ?? []
    expect(columns).toHaveLength(2)
    expect(columns[0].blocks?.[0]).toMatchObject({ elementType: 'text-editor' })
    expect(columns[1].blocks?.[0]).toMatchObject({ elementType: 'image', props: { image: 7 } })
  })

  it('turns a gallery into an image-gallery holding the media ids, with its heading', () => {
    const out = convertLegacyBlock(GALLERY) as TestNode
    const nodes = descendants(out)
    expect(nodes.find((n) => n.elementType === 'heading')?.props?.text).toBe('Recent work')
    const gallery = nodes.find((n) => n.elementType === 'image-gallery')
    expect(gallery?.props?.images).toEqual([3, 4])
    expect(gallery?.props?.urls).toBe('https://cdn.example.com/extra.jpg | Extra piece')
  })

  it.each([
    ['hero', HERO],
    ['ctaBanner', CTA_BANNER],
    ['imageText', IMAGE_TEXT],
    ['gallery', GALLERY],
  ])('loses no field value when a %s is converted', (_type, block) => {
    const out = convertLegacyBlock(block as Record<string, unknown>)
    expect(out).not.toBeNull()
    const serialized = JSON.stringify(out)
    for (const value of stringValues(block)) {
      // JSON escaping applies to the stored text, so compare against the escaped form.
      expect(serialized).toContain(JSON.stringify(value).slice(1, -1))
    }
  })

  it('keeps a string field it has no equivalent for as a text element', () => {
    const out = convertLegacyBlock({ ...CTA_BANNER, legacyNote: 'Keep this line' }) as TestNode
    const serialized = JSON.stringify(out)
    expect(serialized).toContain('Keep this line')
  })
})
