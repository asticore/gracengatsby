import React from 'react'

import { ProductCard } from '@/components/ProductCard'
import { getPayloadClient } from '@/lib/payload'

export const metadata = {
  title: 'Shop | Grace & Gatsby',
}

export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  const payload = await getPayloadClient()

  const { docs: products } = await payload.find({
    collection: 'products',
    where: { _status: { equals: 'published' } },
    sort: '-createdAt',
    limit: 100,
  })

  return (
    <div className="page-shell shop-page">
      <header className="page-header">
        <h1>Shop</h1>
        <p>Considered pieces for the modern romantic.</p>
      </header>

      {products.length === 0 ? (
        <p className="empty-state">
          Nothing here yet - add products from the admin panel and they&apos;ll appear here
          automatically.
        </p>
      ) : (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
