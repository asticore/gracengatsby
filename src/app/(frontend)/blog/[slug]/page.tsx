import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { AdsPageScope } from '@/features/ads/components/AdsPageScope'
import { AdRichText } from '@/features/ads/components/AdRichText'
import { setBlockContext } from '@/lib/blockContext'
import { loadSiteDetails } from '@/features/site/details'
import { postBlockContext } from '@/lib/blockContextFrom'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { annotatePage } from '@/features/editScreens/toc'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import { PageJsonLd } from '@/features/seo'
import { PasswordGate } from '@/components/PasswordGate'
import { PageAudio } from '@/features/pageAudio/PageAudio'
import { loadPageAudioConfig } from '@/features/pageAudio/load'
import { getPasswordGateState } from '@/features/visibility/gate'
import { resolveDocumentContent } from '@/features/customFields/server'
import { loadBlogSwitches } from '@/features/blog/switches'
import { authorPath, publicAuthor, tagPath, categoryPath } from '@/features/siteTemplates/archiveQueries'
import { slugify } from '@/utilities/formatSlug'
import { renderWithTemplate } from '@/features/siteTemplates/render'
import type { Media, Post } from '@/engage-types'

export const dynamic = 'force-dynamic'

/**
 * Published posts only. Drafts are seen through the signed preview route (src/app/(frontend)/preview),
 * which checks a token rather than the visitor's session, so this lookup never needs to return them.
 */
async function getPost(slug: string) {
  const engine = await getEngine()
  const { docs } = (await engine.find({
    collection: 'posts',
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
    limit: 1,
    depth: 1,
  })) as unknown as { docs: Post[] }
  return docs[0] || null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return {}

  // When password-protected, use generic metadata and mark as noindex
  const cookieStore = await cookies()
  const gateState = await getPasswordGateState({
    collection: 'posts',
    id: post.id,
    cookies: cookieStore,
  })

  if (gateState === 'locked') {
    return buildMetadata({
      title: 'Password Protected',
      seo: { ...post.seo, noIndex: true },
      path: `/blog/${slug}`,
      kind: 'article',
    })
  }

  return buildMetadata({
    title: post.title,
    seo: post.seo,
    featuredImage: post.featuredImage,
    path: `/blog/${slug}`,
    kind: 'article',
    publishedAt: post.publishedDate,
    updatedAt: post.updatedAt,
    contentType: 'post',
    tokens: {
      excerpt: post.excerpt,
      category: post.categories?.[0]?.name,
      date: post.publishedDate
        ? new Date(post.publishedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
        : undefined,
    },
  })
}

export default async function BlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const flags = await getFeatureFlags()
  if (!flags.blog) notFound()

  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  // Check password gate
  const cookieStore = await cookies()
  const gateState = await getPasswordGateState({
    collection: 'posts',
    id: post.id,
    cookies: cookieStore,
  })

  const currentPath = `/blog/${slug}`

  if (gateState === 'locked') {
    return <PasswordGate collection="posts" currentPath={currentPath} id={post.id} wrongPassword={sp.pw === 'wrong'} />
  }

  const image = post.featuredImage && typeof post.featuredImage === 'object' ? (post.featuredImage as Media) : null
  const sw = await loadBlogSwitches()
  const author = sw.authors && !(post as unknown as { hideAuthor?: boolean | null }).hideAuthor ? publicAuthor(post as unknown as { author?: unknown }) : null
  const tags = (sw.tags ? (post as unknown as { tags?: Array<{ name?: string | null }> | null }).tags || [] : [])
    .map((t) => (t?.name ?? '').trim())
    .filter((n) => slugify(n))

  // Merge tags ({{field:...}}, {{title}}, ...) are resolved here; unknown braces stay as typed.
  const content = await resolveDocumentContent('posts', post)
  const annotated = annotatePage({ body: content.content, blocks: content.layout || [] })

  const audioConfig = await loadPageAudioConfig((post as { pageAudio?: Parameters<typeof loadPageAudioConfig>[0] }).pageAudio)
  setBlockContext(postBlockContext(post as unknown as Record<string, unknown>, currentPath, (await loadSiteDetails()).businessName, { authors: sw.authors }))
  const body = (
    <article className="page-shell">
      <AdsPageScope collection="posts" noAds={(post as { noAds?: boolean }).noAds} />
      <PageJsonLd collection="posts" doc={post} path={currentPath} />
      {audioConfig && <PageAudio config={audioConfig} />}
      <header className="mx-auto mb-8 max-w-[720px] text-center">
        {post.categories?.length ? (
          <span className="uppercase text-[0.7rem] tracking-[0.08em] text-[var(--color-gold)]">
            {post.categories.map((c, i) => (
              <React.Fragment key={`${c.name}-${i}`}>
                {i > 0 ? ', ' : null}
                {slugify(c.name || '') ? <Link href={categoryPath(slugify(c.name || ''))}>{c.name}</Link> : c.name}
              </React.Fragment>
            ))}
          </span>
        ) : null}
        <h1>{post.title}</h1>
        <p className="flex justify-center gap-3 text-[0.8rem] opacity-65">
          {author ? (sw.authorArchives ? <Link href={authorPath(author.slug)}>{author.name}</Link> : <span>{author.name}</span>) : null}
          {post.publishedDate && <time dateTime={post.publishedDate}>{new Date(post.publishedDate).toLocaleDateString()}</time>}
        </p>
      </header>

      {image?.url && (
        <div className="mb-10 overflow-hidden">
          <Image src={image.url} alt={post.title} width={1200} height={700} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
        </div>
      )}

      <div className="mx-auto max-w-[720px]">
        <AdRichText content={annotated.body as typeof content.content} />
      </div>

      {tags.length > 0 && (
        <p className="mx-auto mt-8 max-w-[720px] text-[0.8rem] opacity-70">
          {tags.map((t) => (
            <Link key={t} href={tagPath(slugify(t))} className="mr-3">#{t}</Link>
          ))}
        </p>
      )}

      {annotated.blocks.map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}
    </article>
  )
  return renderWithTemplate({
    kind: 'single-post',
    ctx: { path: currentPath, postCategories: (post.categories || []).map((c) => c.name), postTags: tags },
    content: body,
  })
}
