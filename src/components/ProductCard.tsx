import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { priceRange, type CatalogueProduct } from '@/features/ecommerce/catalogue'
import { priceInfo } from '@/features/ecommerce/pricing'
import { computeStockStatus } from '@/features/ecommerce/stock'
import { ProductCardPrice } from '@/components/ProductCardPrice'
import type { Media, Product } from '@/engage-types'

const getImageURL = (product: Product): string | null => {
  const first = product.images?.[0]
  if (first && typeof first === 'object') {
    return (first as Media).url ?? null
  }
  return null
}

export const ProductCard: React.FC<{
  product: Product
  showShortDescription?: boolean
  aspect?: 'portrait' | 'square'
}> = ({ product, showShortDescription = false, aspect = 'portrait' }) => {
  const imageURL = getImageURL(product)
  const catalogue = product as unknown as CatalogueProduct
  const range = priceRange(catalogue)
  const info = priceInfo(catalogue)
  const variable = catalogue.productType === 'variable' && range.min !== null && range.max !== null && range.min !== range.max
  const soldOut = (catalogue.productType ?? 'simple') === 'simple' && computeStockStatus(catalogue) === 'outofstock'

  return (
    <Link
      href={`/shop/${product.slug}`}
      className={`product-card product-card--${aspect} block border border-[var(--color-line)] bg-white`}
    >
      <div className="product-card__image relative aspect-[4/5] overflow-hidden bg-[var(--color-cream-dim)]">
        {imageURL ? (
          <Image
            src={imageURL}
            alt={product.title}
            width={480}
            height={aspect === 'square' ? 480 : 600}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div
            className="h-full w-full bg-[image:linear-gradient(135deg,var(--color-cream-dim),var(--color-gold-light))]"
            aria-hidden
          />
        )}
      </div>
      <div className="p-5">
        <span className="text-[0.7rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">
          {product.category || 'Boutique'}
        </span>
        <h3>{product.title}</h3>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[1.25rem]">
          <ProductCardPrice info={info} range={range} variable={variable} fallback={product.priceInAUD} />
          {soldOut ? <span className="ml-2 text-[0.65rem] uppercase tracking-[0.1em] opacity-60">Sold out</span> : null}
        </p>
        {showShortDescription && product.shortDescription && (
          <p className="mt-1.5 text-[0.85rem] opacity-75">{product.shortDescription}</p>
        )}
      </div>
    </Link>
  )
}