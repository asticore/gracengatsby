import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import type { Media } from '@/engage-types'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const engine = await getEngine()
  const settings = await engine.findGlobal({ slug: 'blog-settings' }).catch((): null => null)
  return buildMetadata({ title: settings?.archiveTitle || 'Journal' })
}

export default async function BlogArchivePage() {
  const flags = await getFeatureFlags()
  if (!flags.blog) notFound()

  const engine = await getEngine()
  const settings = await engine.findGlobal({ slug: 'blog-settings' }).catch((): null => null)

  const { docs: posts } = await engine.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    sort: '-publishedDate',
    limit: settings?.postsPerPage || 9,
    depth: 1,
  })

  const layout = settings?.archiveLayout || 'grid'

  return (
    <div className="page-shell blog-archive">
      {settings?.introBlocks && settings.introBlocks.length > 0 ? (
        settings.introBlocks.map((block, index) => <BlockRenderer key={block.id || index} block={block} index={index} />)
      ) : (
        <div className="section-heading">
          <h1>{settings?.archiveTitle || 'Journal'}</h1>
        </div>
      )}
      {settings?.archiveIntro && <p className="blog-archive__intro">{settings.archiveIntro}</p>}

      {posts.length === 0 ? (
        <p className="empty-state">No posts published yet - add one in the admin panel.</p>
      ) : (
        <div className={`blog-archive__${layout}`}>
          {posts.map((post) => {
            const image = post.featuredImage && typeof post.featuredImage === 'object' ? (post.featuredImage as Media) : null
            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="blog-card">
                {image?.url && (
                  <div className="blog-card__image">
                    <Image src={image.url} alt={post.title} width={640} height={420} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
                  </div>
                )}
                <div className="blog-card__body">
                  {settings?.showCategories !== false && post.categories?.length ? (
                    <span className="blog-card__category">{post.categories[0]?.name}</span>
                  ) : null}
                  <h2>{post.title}</h2>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  {settings?.showDate !== false && post.publishedDate && (
                    <time dateTime={post.publishedDate}>{new Date(post.publishedDate).toLocaleDateString()}</time>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
