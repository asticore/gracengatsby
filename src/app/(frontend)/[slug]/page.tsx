import { notFound } from 'next/navigation'
import React from 'react'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { getPayloadClient } from '@/lib/payload'

export const dynamic = 'force-dynamic'

export default async function BuiltPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayloadClient()

  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    depth: 2,
    limit: 1,
  })

  const page = docs[0]

  if (!page) {
    notFound()
  }

  return (
    <div className="built-page">
      {(page.blocks || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} />
      ))}
    </div>
  )
}
