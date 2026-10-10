import Image from 'next/image'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'
import { RichText } from '@/engine/editor/react'
import { cookies } from 'next/headers'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import { PageJsonLd } from '@/features/seo'
import { PasswordGate } from '@/components/PasswordGate'
import { getPasswordGateState } from '@/features/visibility/gate'
import { resolveDocumentContent } from '@/features/customFields/server'
import type { Media, Post, User } from '@/engage-types'

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
  const author = post.author && typeof post.author === 'object' ? (post.author as User) : null

  // Merge tags ({{field:...}}, {{title}}, ...) are resolved here; unknown braces stay as typed.
  const content = await resolveDocumentContent('posts', post)

  return (
    <article className="page-shell">
      <PageJsonLd collection="posts" doc={post} path={currentPath} />
      <header className="mx-auto mb-8 max-w-[720px] text-center">
        {post.categories?.length ? (
          <span className="uppercase text-[0.7rem] tracking-[0.08em] text-[var(--color-gold)]">
            {post.categories.map((c) => c.name).join(', ')}
          </span>
        ) : null}
        <h1>{post.title}</h1>
        <p className="flex justify-center gap-3 text-[0.8rem] opacity-65">
          {author?.email ? <span>{author.email}</span> : null}
          {post.publishedDate && <time dateTime={post.publishedDate}>{new Date(post.publishedDate).toLocaleDateString()}</time>}
        </p>
      </header>

      {image?.url && (
        <div className="mb-10 overflow-hidden">
          <Image src={image.url} alt={post.title} width={1200} height={700} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
        </div>
      )}

      <div className="mx-auto max-w-[720px]">
        <RichText data={content.content} />
      </div>

      {(content.layout || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}
    </article>
  )
}