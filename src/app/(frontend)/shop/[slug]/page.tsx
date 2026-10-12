import { notFound } from 'next/navigation'
import Image from 'next/image'
import React from 'react'
import type { Metadata } from 'next'
import { RichText } from '@/engine/editor/react'

import { ProductPurchase, type GroupedChild } from '@/components/ProductPurchase'
import { ProductReviewForm } from '@/components/ProductReviewForm'
import { AdsPageScope } from '@/features/ads/components/AdsPageScope'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { FaqList } from '@/components/FaqList'
import { ProductCard } from '@/components/ProductCard'
import type { CatalogueProduct } from '@/features/ecommerce/catalogue'
import { normaliseGiftCardSettings } from '@/features/ecommerce/lib/storedValue'
import { aggregateRatingJsonLd, summariseRatings } from '@/features/ecommerce/reviews'
import { buildProductView, offersJsonLd } from '@/features/ecommerce/storefront'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import { PageJsonLd } from '@/features/seo'
import type { Faq, Media, Product, ShopSetting } from '@/engage-types'

export const dynamic = 'force-dynamic'

async function getProduct(slug: string) {
  const engine = await getEngine()
  const { docs } = (await engine.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })) as unknown as { docs: Product[] }
  return docs[0] || null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return {}
  return buildMetadata({ title: product.title, seo: product.seo, path: `/shop/${slug}` })
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

  const [settings] = (await Promise.all([engine.findGlobal({ slug: 'shop-settings' }).catch((): null => null)])) as unknown as [ShopSetting | null]

  const images = (product.images || []).filter(
    (img): img is Media => typeof img === 'object' && img !== null,
  )
  const faqs = (product.faqs || []).filter((f): f is Faq => typeof f === 'object' && f !== null)

  let related: Product[] = []
  if (settings?.showRelatedProducts !== false && product.category) {
    const { docs } = (await engine.find({
      collection: 'products',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { category: { equals: product.category } },
          { id: { not_equals: product.id } },
        ],
      },
      limit: 4,
    })) as unknown as { docs: Product[] }
    related = docs
  }

  const catalogue = product as unknown as CatalogueProduct & Record<string, unknown>
  const mediaUrls = new Map<number, string>(images.filter((img) => img.url).map((img) => [img.id, img.url as string]))
  const view = buildProductView(catalogue, new Date(), mediaUrls)

  const asDocs = (value: unknown): Array<Record<string, unknown> & { id: number }> =>
    (Array.isArray(value) ? value : []).filter((entry): entry is Record<string, unknown> & { id: number } => typeof entry === 'object' && entry !== null)
  const giftSettings = normaliseGiftCardSettings((settings as { giftCards?: unknown } | null)?.giftCards)
  const giftConfig = view.type === 'giftcard' && giftSettings.enabled ? { presets: giftSettings.presetAmounts, allowCustom: giftSettings.allowCustomAmount, min: giftSettings.minAmount, max: giftSettings.maxAmount } : undefined
  const grouped: GroupedChild[] = view.type === 'grouped'
    ? asDocs(catalogue.groupedProducts)
        .filter((child) => child._status === 'published' && child.id !== product.id)
        .slice(0, 50)
        .map((child) => ({ id: child.id, title: String(child.title ?? ''), slug: typeof child.slug === 'string' ? child.slug : null, view: buildProductView(child as unknown as CatalogueProduct) }))
    : []
  const upsells = asDocs(catalogue.upsells).filter((item) => item._status === 'published' && item.id !== product.id).slice(0, 4) as unknown as Product[]

  // Approved reviews only; the public API never returns the reviewer's email.
  const { docs: reviewDocs } = (await engine
    .find({ collection: 'product-reviews', where: { and: [{ product: { equals: product.id } }, { status: { equals: 'approved' } }] }, sort: '-createdAt', limit: 50, depth: 0 })
    .catch((): { docs: never[] } => ({ docs: [] }))) as unknown as { docs: Array<{ id: number; name: string; rating: number; text: string; status: string; verifiedOwner?: boolean; createdAt: string }> }
  const ratings = summariseRatings(reviewDocs)
  const reviewsOn = (settings as { reviewsEnabled?: boolean } | null)?.reviewsEnabled !== false
  const jsonLdExtra: Record<string, unknown> = {
    ...(view.sku ? { sku: view.sku } : {}),
    ...(offersJsonLd(view, 'AUD', `/shop/${slug}`) ? { offers: offersJsonLd(view, 'AUD') } : {}),
    ...(aggregateRatingJsonLd(ratings) ? { aggregateRating: aggregateRatingJsonLd(ratings) } : {}),
  }

  return (
    <div className="page-shell grid grid-cols-[1.1fr_0.9fr] gap-14 max-[900px]:grid-cols-1">
      <AdsPageScope collection="products" noAds={(product as { noAds?: boolean }).noAds} />
      <PageJsonLd collection="products" doc={product} path={`/shop/${slug}`} extra={jsonLdExtra} />
      <div className="grid gap-4">
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
          <div
            className="aspect-[4/5] bg-[image:linear-gradient(135deg,var(--color-cream-dim),var(--color-gold-light))]"
            aria-hidden
          />
        )}
      </div>

      <div>
        {product.category && (
          <span className="text-[0.75rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">
            {product.category}
          </span>
        )}
        <h1 className="text-[2.75rem]">{product.title}</h1>
        {ratings.average ? (
          <p className="mb-2 text-[0.9rem]" aria-label={`Rated ${ratings.average} out of 5`}>
            {'★'.repeat(Math.round(ratings.average))}
            {'☆'.repeat(5 - Math.round(ratings.average))} {ratings.average} ({ratings.count})
          </p>
        ) : null}
        {product.shortDescription && (
          <p className="mb-6 text-[rgba(20,17,15,0.7)]">{product.shortDescription}</p>
        )}

        <ProductPurchase productId={product.id} view={view} grouped={grouped} giftConfig={giftConfig} />

        {view.details.length > 0 && (
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.9rem]">
            {view.details.map((detail) => (
              <React.Fragment key={detail.name}>
                <dt className="opacity-70">{detail.name}</dt>
                <dd className="m-0">{detail.values.join(', ')}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}

        {product.description && (
          <div className="mt-8 border-t border-[var(--color-line)] pt-6">
            <RichText data={product.description} />
          </div>
        )}
      </div>

      {(product.layout || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}

      {faqs.length > 0 && (
        <div className="page-shell col-span-full mt-16">
          <h2>Questions about this piece</h2>
          <FaqList faqs={faqs} layout="accordion" />
        </div>
      )}

      {reviewsOn && (
        <div className="page-shell col-span-full mt-16" id="reviews">
          <h2>Reviews</h2>
          {reviewDocs.length === 0 ? <p>No reviews yet.</p> : null}
          <ul className="m-0 mb-8 list-none p-0">
            {reviewDocs.map((review) => (
              <li key={review.id} className="border-b border-[var(--color-line)] py-4">
                <p className="m-0" aria-label={`${review.rating} out of 5`}>
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </p>
                <p className="my-1 whitespace-pre-wrap">{review.text}</p>
                <p className="m-0 text-[0.8rem] opacity-70">
                  {review.name}
                  {review.verifiedOwner ? ' - Verified buyer' : ''}
                </p>
              </li>
            ))}
          </ul>
          <h3>Write a review</h3>
          <ProductReviewForm productId={product.id} />
        </div>
      )}

      {upsells.length > 0 && (
        <div className="page-shell col-span-full mt-16">
          <div className="section-heading">
            <h2>You may also like</h2>
          </div>
          <div className="product-grid">
            {upsells.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="page-shell col-span-full mt-16">
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
