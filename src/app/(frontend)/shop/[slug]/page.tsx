import { notFound } from 'next/navigation'
import Image from 'next/image'
import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'

import { AddToCartButton } from '@/components/AddToCartButton'
import { formatCurrency } from '@/lib/formatCurrency'
import { getPayloadClient } from '@/lib/payload'
import type { Media } from '@/payload-types'

export const revalidate = 60

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayloadClient()

  const { docs } = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
  })

  const product = docs[0]

  if (!product) {
    notFound()
  }

  const images = (product.images || []).filter(
    (img): img is Media => typeof img === 'object' && img !== null,
  )

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
    </div>
  )
}
