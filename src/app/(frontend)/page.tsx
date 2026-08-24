import Link from 'next/link'
import React from 'react'
import type { Metadata } from 'next'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { EventCard } from '@/components/EventCard'
import { ProductCard } from '@/components/ProductCard'
import { getEngine } from '@/lib/engine'
import { getHomepage } from '@/utilities/pagePaths'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const homepage = await getHomepage()
  return buildMetadata({ title: homepage?.title || 'Grace & Gatsby', seo: homepage?.seo })
}

export default async function HomePage() {
  const homepage = await getHomepage()

  // Once a Page is marked "Set as homepage" in the admin panel, it takes over
  // "/" completely and is edited like any other built page. Until then, this
  // curated default keeps the site looking finished out of the box.
  if (homepage) {
    return (
      <div className="built-page">
        {(homepage.blocks || []).map((block, index) => (
          <BlockRenderer key={block.id || index} block={block} index={index} />
        ))}
      </div>
    )
  }

  return <DefaultHomepage />
}

async function DefaultHomepage() {
  const engine = await getEngine()
  const now = new Date().toISOString()

  const [{ docs: products }, { docs: events }] = await Promise.all([
    engine.find({
      collection: 'products',
      where: { _status: { equals: 'published' } },
      sort: '-createdAt',
      limit: 4,
    }),
    engine.find({
      collection: 'events',
      where: {
        and: [{ _status: { equals: 'published' } }, { startDate: { greater_than_equal: now } }],
      },
      sort: 'startDate',
      limit: 3,
    }),
  ])

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <p className="hero__eyebrow">Brisbane, Australia</p>
          <h1>Grace &amp; Gatsby</h1>
          <p className="hero__tagline">
            A curated boutique for the modern romantic - considered pieces, small-batch goods, and
            evenings worth dressing up for.
          </p>
          <div className="hero__actions">
            <Link href="/shop" className="btn btn--primary">
              Shop the collection
            </Link>
            <Link href="/events" className="btn btn--ghost">
              See what&apos;s on
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="page-shell">
          <div className="section-heading">
            <h2>New arrivals</h2>
            <Link href="/shop">View all</Link>
          </div>

          {products.length === 0 ? (
            <p className="empty-state">
              Your shop is ready - add products in the admin panel and they&apos;ll appear here.
            </p>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="home-section home-section--dark">
        <div className="page-shell">
          <div className="section-heading">
            <h2>Upcoming events</h2>
            <Link href="/events">View all</Link>
          </div>

          {events.length === 0 ? (
            <p className="empty-state">
              Nothing on the calendar yet - add an event in the admin panel to start taking RSVPs
              and ticket sales.
            </p>
          ) : (
            <div className="event-grid">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="home-section about-section" id="about">
        <div className="page-shell about-section__inner">
          <h2>Our story</h2>
          <p>
            Grace &amp; Gatsby began as a love letter to considered style - Art Deco glamour reimagined
            for everyday wear. Every piece in the shop is chosen for the way it makes you feel, and
            every event on our calendar is an excuse to wear it.
          </p>
        </div>
      </section>
    </>
  )
}
