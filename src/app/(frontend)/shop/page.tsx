import Link from 'next/link'
import React from 'react'
import { notFound } from 'next/navigation'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { ProductCard } from '@/components/ProductCard'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'

export async function generateMetadata() {
  return buildMetadata({ title: 'Shop' })
}

export const dynamic = 'force-dynamic'

const CATEGORIES = [
  { label: 'Apparel', value: 'apparel' },
  { label: 'Accessories', value: 'accessories' },
  { label: 'Jewellery', value: 'jewellery' },
  { label: 'Homeware', value: 'homeware' },
  { label: 'Gifting', value: 'gifting' },
]

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const flags = await getFeatureFlags()
  if (!flags.ecommerce) notFound()

  const { category } = await searchParams
  const engine = await getEngine()

  const [settings, { docs: products }] = await Promise.all([
    engine.findGlobal({ slug: 'shop-settings' }).catch((): null => null),
    engine.find({
      collection: 'products',
      where: {
        and: [{ _status: { equals: 'published' } }, ...(category ? [{ category: { equals: category } }] : [])],
      },
      sort: '-createdAt',
      limit: 100,
    }),
  ])

  const layout = settings?.archiveLayout || 'grid-4'

  return (
    <div className="page-shell shop-page">
      {settings?.introBlocks && settings.introBlocks.length > 0 ? (
        settings.introBlocks.map((block, index) => <BlockRenderer key={block.id || index} block={block} index={index} />)
      ) : (
        <header className="page-header">
          <h1>Shop</h1>
          <p>Considered pieces for the modern romantic.</p>
        </header>
      )}

      {settings?.showCategoryFilters !== false && (
        <div className="shop-page__filters">
          <Link href="/shop" className={!category ? 'is-active' : ''}>
            All
          </Link>
          {CATEGORIES.map((cat) => (
            <Link key={cat.value} href={`/shop?category=${cat.value}`} className={category === cat.value ? 'is-active' : ''}>
              {cat.label}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <p className="empty-state">
          Nothing here yet - add products from the admin panel and they&apos;ll appear here
          automatically.
        </p>
      ) : (
        <div className={`product-grid product-grid--${layout}`}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} showShortDescription={settings?.showShortDescriptionOnCard || false} aspect={settings?.productImageAspect || 'portrait'} />
          ))}
        </div>
      )}
    </div>
  )
}
