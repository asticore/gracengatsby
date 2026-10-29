import { notFound } from 'next/navigation'
import { contentAvailableHere } from '@/features/domains/request'
import { cookies } from 'next/headers'
import React from 'react'
import type { Metadata } from 'next'
import { RichText } from '@/engine/editor/react'

import { formatPriceInAUD } from '@/lib/formatCurrency'
import { priceLocale } from '@/features/uiStrings/publicFormat'
import { publicLocale } from '@/features/uiStrings/storeTextsServer'
import { ProductPurchase, type GroupedChild } from '@/components/ProductPurchase'
import { BackInStockForm } from '@/components/BackInStockForm'
import { SubscriptionOffer } from '@/features/ecommerce/subscriptions/components/SubscriptionOffer'
import { ProductReviewForm } from '@/components/ProductReviewForm'
import { AdsPageScope } from '@/features/ads/components/AdsPageScope'
import { setBlockContext, setRequestQuery } from '@/lib/blockContext'
import { productBlockContext } from '@/lib/blockContextFrom'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { FaqList } from '@/components/FaqList'
import { ProductCard } from '@/components/ProductCard'
import { WishlistHeart } from '@/components/WishlistHeart'
import { ProductGallery } from '@/components/ProductGallery'
import { BundleContentsList } from '@/components/BundleContentsList'
import { ProductRecommendations } from '@/components/ProductRecommendations'
import { bundleStorefrontFields } from '@/features/ecommerce/server/bundles'
import { VariationImageProvider } from '@/components/VariationImageProvider'
import { wishlistEnabled } from '@/features/ecommerce/lib/wishlist'
import type { CatalogueProduct } from '@/features/ecommerce/catalogue'
import { normaliseGiftCardSettings } from '@/features/ecommerce/lib/storedValue'
import { showBackInStockForm } from '@/features/ecommerce/lib/backInStock'
import { aggregateRatingJsonLd, summariseRatings } from '@/features/ecommerce/reviews'
import { buildProductView, offersJsonLd } from '@/features/ecommerce/storefront'
import { loadPreordersEnabled } from '@/features/ecommerce/server/shopExtra'
import { loadShopRulesConfig } from '@/features/ecommerce/server/pricingRules'
import { productPageNotes } from '@/features/ecommerce/lib/pricingRules'
import { PasswordGate } from '@/components/PasswordGate'
import { getPasswordGateState } from '@/features/visibility/gate'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { currentRequestLocale, applyTranslations, applyTranslationsToDocs } from '@/features/multilingual/applyTranslations'
import { buildMetadata } from '@/utilities/seo'
import { PageJsonLd } from '@/features/seo'
import { renderWithTemplate } from '@/features/siteTemplates/render'
import type { Faq, Media, Product, ShopSetting } from '@/engage-types'

const STAR_ON = String.fromCharCode(0x2605)
const STAR_OFF = String.fromCharCode(0x2606)

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
  const product = await applyTranslations(await getProduct(slug), 'products', await currentRequestLocale())
  if (!product) return {}

  // When password protected and locked, use generic metadata and keep it out of the index.
  const lockedMeta = await getPasswordGateState({ collection: 'products', id: product.id, cookies: await cookies() })
  if (lockedMeta === 'locked') {
    return { title: 'Password Protected', robots: { index: false, follow: false, googleBot: { index: false, follow: false } } }
  }

  return buildMetadata({
    title: product.title,
    seo: product.seo,
    availableDomains: (product as { availableDomains?: unknown }).availableDomains,
    path: `/shop/${slug}`,
    contentType: 'product',
    tokens: { price: formatPriceInAUD(product.priceInAUD, 'AUD', priceLocale(await publicLocale())), excerpt: product.shortDescription },
  })
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  setRequestQuery(sp)
  const flags = await getFeatureFlags()
  if (!flags.ecommerce) notFound()

  const { slug } = await params
  const engine = await getEngine()
  const product = await applyTranslations(await getProduct(slug), 'products', await currentRequestLocale())

  if (!product) {
    notFound()
  }
  if (!(await contentAvailableHere((product as { availableDomains?: unknown }).availableDomains))) notFound()

  const gateState = await getPasswordGateState({ collection: 'products', id: product.id, cookies: await cookies() })
  if (gateState === 'locked') {
    return <PasswordGate collection="products" currentPath={`/shop/${slug}`} id={product.id} wrongPassword={sp.pw === 'wrong'} />
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
    related = await excludeProtected('products', docs)
  }

  const catalogue = product as unknown as CatalogueProduct & Record<string, unknown>
  const mediaUrls = new Map<number, string>(images.filter((img) => img.url).map((img) => [img.id, img.url as string]))
  const preordersOn = await loadPreordersEnabled(engine)
  // A bundle's price and stock come from the products inside it (server/bundles.ts), so they replace the bundle's own fields here.
  const bundle = catalogue.productType === 'bundle' ? await bundleStorefrontFields(engine as never, product as never, new Date(), preordersOn) : null
  const shopRules = await loadShopRulesConfig(engine)
  const view = buildProductView(bundle ? { ...catalogue, ...bundle } : catalogue, new Date(), mediaUrls, {
    preorders: preordersOn,
    addOnsOn: shopRules.addOnsOn,
    pricingNotes: shopRules.rulesOn ? productPageNotes(shopRules.rules) : [],
  })

  const asDocs = (value: unknown): Array<Record<string, unknown> & { id: number }> =>
    (Array.isArray(value) ? value : []).filter((entry): entry is Record<string, unknown> & { id: number } => typeof entry === 'object' && entry !== null)
  const giftSettings = normaliseGiftCardSettings((settings as { giftCards?: unknown } | null)?.giftCards)
  const giftConfig = view.type === 'giftcard' && giftSettings.enabled ? { presets: giftSettings.presetAmounts, allowCustom: giftSettings.allowCustomAmount, min: giftSettings.minAmount, max: giftSettings.maxAmount } : undefined
  const groupedOpen = view.type === 'grouped' ? await excludeProtected('products', asDocs(catalogue.groupedProducts)) : []
  const grouped: GroupedChild[] = view.type === 'grouped'
    ? groupedOpen
        .filter((child) => child._status === 'published' && child.id !== product.id)
        .slice(0, 50)
        .map((child) => ({ id: child.id, title: String(child.title ?? ''), slug: typeof child.slug === 'string' ? child.slug : null, view: buildProductView(child as unknown as CatalogueProduct, new Date(), new Map(), { preorders: preordersOn }) }))
    : []
  const upsells = (await excludeProtected('products', asDocs(catalogue.upsells))).filter((item) => item._status === 'published' && item.id !== product.id).slice(0, 4) as unknown as Product[]

  // Approved reviews only; the public API never returns the reviewer's email.
  const { docs: reviewDocs } = (await engine
    .find({ collection: 'product-reviews', where: { and: [{ product: { equals: product.id } }, { status: { equals: 'approved' } }] }, sort: '-createdAt', limit: 50, depth: 0 })
    .catch((): { docs: never[] } => ({ docs: [] }))) as unknown as { docs: Array<{ id: number; name: string; rating: number; text: string; status: string; verifiedOwner?: boolean; createdAt: string }> }
  const ratings = summariseRatings(reviewDocs)
  const reviewsOn = (settings as { reviewsEnabled?: boolean } | null)?.reviewsEnabled !== false
  // Same brand the Google feed uses: the feed brand, else the business name.
  const brandSource = settings as { storefront?: { feedBrand?: string | null }; tax?: { businessName?: string | null } } | null
  const brandName = (brandSource?.storefront?.feedBrand || brandSource?.tax?.businessName || '').trim()
  const jsonLdExtra: Record<string, unknown> = {
    ...(view.sku ? { sku: view.sku } : {}),
    ...(brandName ? { brand: { '@type': 'Brand', name: brandName } } : {}),
    ...(offersJsonLd(view, 'AUD', `/shop/${slug}`) ? { offers: offersJsonLd(view, 'AUD') } : {}),
    ...(aggregateRatingJsonLd(ratings) ? { aggregateRating: aggregateRatingJsonLd(ratings) } : {}),
  }

  setBlockContext(productBlockContext(product as unknown as Record<string, unknown>, `/shop/${slug}`))
  const body = (
    <VariationImageProvider>
    <div className="page-shell grid grid-cols-[1.1fr_0.9fr] gap-14 max-[900px]:grid-cols-1">
      <AdsPageScope collection="products" noAds={(product as { noAds?: boolean }).noAds} />
      <PageJsonLd collection="products" doc={product} path={`/shop/${slug}`} extra={jsonLdExtra} />
      <ProductGallery images={images} title={product.title} />

      <div>
        {product.category && (
          <span className="text-[0.75rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">
            {product.category}
          </span>
        )}
        <h1 className="text-[2.75rem]">{product.title}</h1>
        {ratings.average ? (
          <p className="mb-2 text-[0.9rem]" aria-label={`Rated ${ratings.average} out of 5`}>
            {STAR_ON.repeat(Math.round(ratings.average))}
            {STAR_OFF.repeat(5 - Math.round(ratings.average))} {ratings.average} ({ratings.count})
          </p>
        ) : null}
        {product.shortDescription && (
          <p className="mb-6 text-[rgba(20,17,15,0.7)]">{product.shortDescription}</p>
        )}

        {bundle ? <BundleContentsList items={bundle.contents} /> : null}
        <ProductPurchase productId={product.id} view={view} grouped={grouped} giftConfig={giftConfig} />
        <SubscriptionOffer product={product} />
        {showBackInStockForm(settings, catalogue) && !view.preorder.active ? <BackInStockForm productId={product.id} /> : null}
        {wishlistEnabled(settings) && <div className="mt-4"><WishlistHeart productId={product.id} showLink /></div>}

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
                  {STAR_ON.repeat(review.rating)}
                  {STAR_OFF.repeat(5 - review.rating)}
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

      <ProductRecommendations productId={product.id} category={product.category ? String(product.category) : null} />

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
    </VariationImageProvider>
  )
  return renderWithTemplate({
    kind: 'single-product',
    ctx: { path: `/shop/${slug}`, productCategory: product.category ? String(product.category) : null, productType: typeof catalogue.productType === 'string' ? catalogue.productType : null },
    content: body,
  })
}
