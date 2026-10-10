import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { findPageByPath } from '@/utilities/pagePaths'
import { buildMetadata } from '@/utilities/seo'
import { PageJsonLd } from '@/features/seo'
import { PasswordGate } from '@/components/PasswordGate'
import { getPasswordGateState } from '@/features/visibility/gate'
import { resolveDocumentContent } from '@/features/customFields/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params
  const resolved = await findPageByPath(slug)
  if (!resolved) return {}

  // When password-protected, use generic metadata and mark as noindex
  const cookieStore = await cookies()
  const gateState = await getPasswordGateState({
    collection: 'pages',
    id: resolved.page.id,
    cookies: cookieStore,
  })

  if (gateState === 'locked') {
    return buildMetadata({
      title: 'Password Protected',
      seo: { ...resolved.page.seo, noIndex: true },
      path: `/${slug.join('/')}`,
    })
  }

  return buildMetadata({ title: resolved.page.title, seo: resolved.page.seo, path: `/${slug.join('/')}` })
}

export default async function BuiltPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const { slug } = await params
  const resolved = await findPageByPath(slug)

  if (!resolved) {
    notFound()
  }

  const { page, ancestors } = resolved

  // Check password gate
  const cookieStore = await cookies()
  const gateState = await getPasswordGateState({
    collection: 'pages',
    id: page.id,
    cookies: cookieStore,
  })

  const currentPath = `/${slug.join('/')}`

  if (gateState === 'locked') {
    return <PasswordGate collection="pages" currentPath={currentPath} id={page.id} wrongPassword={sp.pw === 'wrong'} />
  }

  // Merge tags ({{field:...}}, {{title}}, ...) are resolved here; unknown braces stay as typed.
  const content = await resolveDocumentContent('pages', page)

  return (
    <div className="built-page">
      <PageJsonLd collection="pages" doc={page} path={currentPath} />
      {ancestors.length > 0 && (
        <nav
          className="mx-auto flex max-w-[var(--max-width)] flex-wrap gap-2 px-6 pt-4 text-[0.8rem] tracking-[0.04em] text-[rgba(20,17,15,0.6)]"
          aria-label="Breadcrumb"
        >
          <Link href="/">Home</Link>
          {ancestors.map((ancestor) => (
            <React.Fragment key={ancestor.id}>
              <span className="opacity-50">/</span>
              <span>{ancestor.title}</span>
            </React.Fragment>
          ))}
          <span className="opacity-50">/</span>
          <span className="text-[var(--color-ink)]">{page.title}</span>
        </nav>
      )}
      {(content.blocks || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}
    </div>
  )
}