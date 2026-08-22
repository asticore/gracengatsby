import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { FaqList } from '@/components/FaqList'
import { getPayloadClient } from '@/lib/payload'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPayloadClient()
  const settings = await payload.findGlobal({ slug: 'faq-settings' }).catch((): null => null)
  return buildMetadata({ title: settings?.pageTitle || 'FAQ' })
}

export default async function FaqPage() {
  const flags = await getFeatureFlags()
  if (!flags.faq) notFound()

  const payload = await getPayloadClient()
  const [settings, { docs: faqs }] = await Promise.all([
    payload.findGlobal({ slug: 'faq-settings' }).catch((): null => null),
    payload.find({ collection: 'faqs', sort: 'order', limit: 200 }),
  ])

  return (
    <div className="page-shell faq-page">
      {settings?.introBlocks && settings.introBlocks.length > 0 ? (
        settings.introBlocks.map((block, index) => <BlockRenderer key={block.id || index} block={block} index={index} />)
      ) : (
        <div className="section-heading">
          <h1>{settings?.pageTitle || 'Frequently Asked Questions'}</h1>
        </div>
      )}
      {settings?.intro && <p className="faq-page__intro">{settings.intro}</p>}

      {faqs.length === 0 ? (
        <p className="empty-state">No FAQs added yet - add some in the admin panel.</p>
      ) : (
        <FaqList faqs={faqs} layout={settings?.layout || 'accordion'} groupByCategory={settings?.groupByCategory !== false} />
      )}
    </div>
  )
}
