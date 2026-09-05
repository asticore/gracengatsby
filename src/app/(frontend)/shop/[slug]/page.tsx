import { notFound } from 'next/navigation'
import Image from 'next/image'
import React from 'react'
import type { Metadata } from 'next'
import { RichText } from '@/engine/editor/react'

import { AddToCartButton } from '@/components/AddToCartButton'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { FaqList } from '@/components/FaqList'
import { ProductCard } from '@/components/ProductCard'
import { formatCurrency } from '@/lib/formatCurrency'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import type { Faq, Media, Product } from '@/engage-types'

export const dynamic = 'force-dynamic'

async function getProduct(slug: string) {
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return docs[0] || null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return {}
  return buildMetadata({ title: product.title, seo: product.seo })
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const flags = await getFeatureFlags()
  if (!flags.ecommerce) notFound()

  const { slug } = await params
  const engine = await getEngine()
  const product = await getProduct(slug)

  if (!product) {
    notFound()
  }

  const [settings] = await Promise.all([engine.findGlobal({ slug: 'shop-settings' }).catch((): null => null)])

  const images = (product.images || []).filter(
    (img): img is Media => typeof img === 'object' && img !== null,
  )
  const faqs = (product.faqs || []).filter((f): f is Faq => typeof f === 'object' && f !== null)

  let related: Product[] = []
  if (settings?.showRelatedProducts !== false && product.category) {
    const { docs } = await engine.find({
      collection: 'products',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { category: { equals: product.category } },
          { id: { not_equals: product.id } },
        ],
      },
      limit: 4,
    })
    related = docs
  }

  return (
    <div className="page-shell product-page">
      <div className="product-page__gallery">
        {images.length > 0 ? (
          images.map((img) => (
            <Image
              key={img.id}
              src={img.url || ''}
              alt={img.alt || product.title}
              width={800}
              height={1000}
              style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
            />
          ))
        ) : (
          <div className="product-page__placeholder" aria-hidden />
        )}
      </div>

      <div className="product-page__details">
        {product.category && <span className="product-page__category">{product.category}</span>}
        <h1>{product.title}</h1>
        <p className="product-page__price">{formatCurrency(product.priceInAUD)}</p>
        {product.shortDescription && <p className="product-page__short">{product.shortDescription}</p>}

        <AddToCartButton productID={product.id} />

        {product.description && (
          <div className="product-page__description">
            <RichText data={product.description} />
          </div>
        )}
      </div>

      {(product.layout || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}

      {faqs.length > 0 && (
        <div className="product-page__faqs page-shell">
          <h2>Questions about this piece</h2>
          <FaqList faqs={faqs} layout="accordion" />
        </div>
      )}

      {related.length > 0 && (
        <div className="product-page__related page-shell">
          <div className="section-heading">
            <h2>You might also like</h2>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
