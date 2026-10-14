import React from 'react'

import { ProductCard } from '@/components/ProductCard'
import { getEngine } from '@/lib/engine'
import { loadRecommendationSettings, recommendedProducts, type RecommendEngine } from '@/features/ecommerce/server/recommendations'
import type { Product } from '@/engage-types'

/**
 * "Customers also bought" under a product page. Server component: reads the shop switch and the co-purchase
 * table itself. Renders nothing while the switch is off or there is nothing to suggest.
 */
export async function ProductRecommendations({ productId, category }: { productId: number; category: string | null }) {
  const engine = (await getEngine()) as unknown as RecommendEngine
  const settings = await loadRecommendationSettings(engine)
  if (!settings.enabled) return null
  const docs = await recommendedProducts(engine, { anchorIds: [productId], categories: category ? [category] : [], limit: settings.max })
  if (docs.length === 0) return null
  return (
    <div className="page-shell col-span-full mt-16">
      <div className="section-heading">
        <h2>Customers also bought</h2>
      </div>
      <div className="product-grid">
        {docs.map((item) => (
          <ProductCard key={item.id} product={item as unknown as Product} />
        ))}
      </div>
    </div>
  )
}
