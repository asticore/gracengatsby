import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { AdsPageScope } from '@/features/ads/components/AdsPageScope'
import { setBlockContext } from '@/lib/blockContext'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { annotatePage } from '@/features/editScreens/toc'
import { findPageByPath } from '@/utilities/pagePaths'
import { buildMetadata } from '@/utilities/seo'
import { PageJsonLd } from '@/features/seo'
import { PasswordGate } from '@/components/PasswordGate'
import { getPasswordGateState } from '@/features/visibility/gate'
import { resolveDocumentContent } from '@/features/customFields/server'
import { normalisePageAudio } from '@/features/pageAudio/config'
import { PageAudio } from '@/features/pageAudio/PageAudio'
import { getEngine } from '@/lib/engine'

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
    withAccount: true,
  })

  if (gateState === 'locked') {
    return {
      title: 'Password Protected',
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    }
  }

  return buildMetadata({
    title: resolved.page.title,
    seo: resolved.page.seo,
    path: `/${slug.join('/')}`,
    contentType: 'page',
    tokens: { excerpt: (resolved.page as { excerpt?: string | null }).excerpt },
  })
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
    withAccount: true,
  })

  const currentPath = `/${slug.join('/')}`

  if (gateState === 'locked') {
    return <PasswordGate collection="pages" currentPath={currentPath} id={page.id} wrongPassword={sp.pw === 'wrong'} />
  }

  // Merge tags ({{field:...}}, {{title}}, ...) are resolved here; unknown braces stay as typed.
  const content = await resolveDocumentContent('pages', page)

  // Background audio: only an enabled page ships the client component. Public data only (edge cached).
  const audioGroup = (page as { pageAudio?: { enabled?: boolean | null; sourceType?: string | null; media?: unknown } }).pageAudio
  let audioMediaUrl: string | null = null
  if (audioGroup?.enabled === true && audioGroup.sourceType !== 'url' && audioGroup.media) {
    try {
      const mediaId = typeof audioGroup.media === 'object' ? (audioGroup.media as { id: number }).id : (audioGroup.media as number)
      const media = (await (await getEngine()).findByID({ collection: 'media', id: mediaId, depth: 0 })) as { url?: string | null } | null
      audioMediaUrl = media?.url ?? null
    } catch {
      audioMediaUrl = null
    }
  }
  const audioConfig = normalisePageAudio(audioGroup, audioMediaUrl)

  setBlockContext({ page: { title: page.title }, path: currentPath })
  return (
    <div className="built-page">
      <AdsPageScope collection="pages" noAds={(page as { noAds?: boolean }).noAds} />
      <PageJsonLd
        collection="pages"
        doc={page}
        path={currentPath}
        trail={ancestors.map((ancestor, index) => ({
          name: ancestor.title,
          path: `/${ancestors.slice(0, index + 1).map((item) => item.slug).join('/')}`,
        }))}
      />
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
      {annotatePage({ blocks: content.blocks || [] }).blocks.map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}
      {audioConfig && <PageAudio config={audioConfig} />}
    </div>
  )
}
