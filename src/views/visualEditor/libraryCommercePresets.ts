import { getElementDef } from '@/lib/elements/registry'
import type { SectionNode } from '@/lib/sectionTree'

export type CommercePresetCard = { id: string; label: string; description: string }

const el = (elementType: string, props: Record<string, unknown> = {}): SectionNode => ({
  blockType: 'element',
  elementType,
  props: { ...(getElementDef(elementType)?.defaultProps() || {}), ...props },
})

type Preset = CommercePresetCard & { build: () => SectionNode }

/* There is no cart or product element, so these use the productGrid block plus heading, image-box, dynamic-text and button elements. */
const PRESETS: Preset[] = [
  {
    id: 'product-grid-3',
    label: 'Product grid (3 col)',
    description: 'A heading over a grid of products, three across.',
    build: () => ({
      blockType: 'section',
      columns: [
        {
          width: 12 as const,
          blocks: [
            el('heading', { text: 'Shop', tag: 'h2', align: 'center' }),
            { blockType: 'productGrid', heading: '', limit: 6, design: { layout: { display: 'grid', gridColumns: 3 } } },
          ],
        },
      ],
    }),
  },
  {
    id: 'featured-product',
    label: 'Featured product',
    description: 'One product with a picture, name, price and a buy button.',
    build: () => ({
      blockType: 'section',
      columns: [
        { width: 6 as const, blocks: [el('image-box', { alt: 'Featured product' })] },
        {
          width: 6 as const,
          blocks: [
            el('heading', { text: 'Featured product', tag: 'h2', align: 'left' }),
            el('dynamic-text', { template: '{{product.price}}', tag: 'p' }),
            el('button', { text: 'Shop now', url: '/shop', variant: 'primary', align: 'left' }),
          ],
        },
      ],
    }),
  },
  {
    id: 'mini-cart-button',
    label: 'Mini cart button',
    description: 'A button that opens the cart page.',
    build: () => ({
      blockType: 'section',
      columns: [{ width: 12 as const, blocks: [el('button', { text: 'View cart', url: '/cart', variant: 'secondary', align: 'right' })] }],
    }),
  },
]

export function commercePresetCards(): CommercePresetCard[] {
  return PRESETS.map(({ id, label, description }) => ({ id, label, description }))
}

export function filterCommercePresetCards(cards: CommercePresetCard[], query: string): CommercePresetCard[] {
  const needle = query.trim().toLowerCase()
  return cards.filter(
    (c) => !needle || c.label.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle) || 'shop'.includes(needle),
  )
}

/** A fresh section node for the preset, or null for an unknown id. */
export function commercePresetNode(id: string): SectionNode | null {
  return PRESETS.find((p) => p.id === id)?.build() ?? null
}
