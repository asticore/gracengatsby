import Image from 'next/image'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'
import { RichText } from '@payloadcms/richtext-lexical/react'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { getPayloadClient } from '@/lib/payload'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import type { Media, User } from '@/payload-types'

export const dynamic = 'force-dynamic'

async function getPost(slug: string) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return docs[0] || null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return {}
  return buildMetadata({ title: post.title, seo: post.seo })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const flags = await getFeatureFlags()
  if (!flags.blog) notFound()

  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  const image = post.featuredImage && typeof post.featuredImage === 'object' ? (post.featuredImage as Media) : null
  const author = post.author && typeof post.author === 'object' ? (post.author as User) : null

  return (
    <article className="page-shell blog-post">
      <header className="blog-post__header">
        {post.categories?.length ? (
          <span className="blog-card__category">{post.categories.map((c) => c.name).join(', ')}</span>
        ) : null}
        <h1>{post.title}</h1>
        <p className="blog-post__meta">
          {author?.email ? <span>{author.email}</span> : null}
          {post.publishedDate && <time dateTime={post.publishedDate}>{new Date(post.publishedDate).toLocaleDateString()}</time>}
        </p>
      </header>

      {image?.url && (
        <div className="blog-post__image">
          <Image src={image.url} alt={post.title} width={1200} height={700} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
        </div>
      )}

      <div className="blog-post__content">
        <RichText data={post.content} />
      </div>

      {(post.layout || []).map((block, index) => (
        <BlockRenderer key={block.id || index} block={block} index={index} />
      ))}
    </article>
  )
}
