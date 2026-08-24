import { ProductCard } from '@/components/ProductCard'
import { getEngine } from '@/lib/engine'

export async function ProductGridBlock({
  heading,
  category,
  limit,
}: {
  heading?: string | null
  category?: string | null
  limit?: number | null
}) {
  const engine = await getEngine()

  const { docs: products } = await engine.find({
    collection: 'products',
    where: {
      and: [
        { _status: { equals: 'published' } },
        ...(category ? [{ category: { equals: category } }] : []),
      ],
    },
    sort: '-createdAt',
    limit: limit || 4,
  })

  if (products.length === 0) return null

  return (
    <section className="home-section built-block built-block--productgrid">
      <div className="page-shell">
        {heading && (
          <div className="section-heading">
            <h2>{heading}</h2>
          </div>
        )}
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
