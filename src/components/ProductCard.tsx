import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { formatCurrency } from '@/lib/formatCurrency'
import type { Media, Product } from '@/payload-types'

const getImageURL = (product: Product): string | null => {
  const first = product.images?.[0]
  if (first && typeof first === 'object') {
    return (first as Media).url ?? null
  }
  return null
}

export const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const imageURL = getImageURL(product)

  return (
    <Link href={`/shop/${product.slug}`} className="product-card">
      <div className="product-card__image">
        {imageURL ? (
          <Image
            src={imageURL}
            alt={product.title}
            width={480}
            height={600}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div className="product-card__placeholder" aria-hidden />
        )}
      </div>
      <div className="product-card__body">
        <span className="product-card__category">{product.category || 'Boutique'}</span>
        <h3>{product.title}</h3>
        <p className="product-card__price">{formatCurrency(product.priceInAUD)}</p>
      </div>
    </Link>
  )
}
