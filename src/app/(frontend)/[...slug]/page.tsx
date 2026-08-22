import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { findPageByPath } from '@/utilities/pagePaths'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params
  const resolved = await findPageByPath(slug)
  if (!resolved) return {}
  return buildMetadata({ title: resolved.page.title, seo: resolved.page.seo, path: `/${slug.join('/')}` })
}

export default async function BuiltPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const resolved = await findPageByPath(slug)

  if (!resolved) {
    notFound()
  }

  const { page, ancestors } = resolved

  return (
    <div className="built-page">
      {ancestors.length > 0 && (
        <nav className="breadcrumbs page-shell" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {ancestors.map((ancestor) => (
            <React.Fragment key={ancestor.id}>
              <span className="breadcrumbs__sep">/</span>
              <span>{ancestor.title}</span>
            </React.Fragment>
          ))}
          <span className="breadcrumbs__sep">/</span>
          <span className="breadcrumbs__current">{page.title}</span>
        </nav>
      )}
      {(page.blocks || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} />
      ))}
    </div>
  )
}
