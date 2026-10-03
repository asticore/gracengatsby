import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import { buildPageJsonLd } from '@/features/seo/pageSchema'
import { getSeoContext } from '@/features/seo/settings'
import type { BlogSetting, Media, Post } from '@/engage-types'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'blog-settings' }).catch((): null => null)) as BlogSetting | null
  return buildMetadata({ title: settings?.archiveTitle || 'Journal', path: '/blog' })
}

export default async function BlogArchivePage() {
  const flags = await getFeatureFlags()
  if (!flags.blog) notFound()

  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'blog-settings' }).catch((): null => null)) as BlogSetting | null

  const { docs: posts } = (await engine.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    sort: '-publishedDate',
    limit: settings?.postsPerPage || 9,
    depth: 1,
  })) as unknown as { docs: Post[] }

  const layout = settings?.archiveLayout || 'grid'

  const context = await getSeoContext()
  const title = settings?.archiveTitle || 'Journal'
  const jsonLd = context.enabled
    ? buildPageJsonLd({
        collection: 'pages',
        schemaType: 'CollectionPage',
        title,
        description: settings?.archiveIntro,
        url: context.baseUrl + '/blog',
        baseUrl: context.baseUrl,
        siteName: context.siteName,
      })
    : null

  return (
    <div className="page-shell">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll('</', '</\\/') }}
        />
      )}
      {settings?.introBlocks && settings.introBlocks.length > 0 ? (
        settings.introBlocks.map((block, index) => <BlockRenderer key={block.id || index} block={block} index={index} />)
      ) : (
        <div className="section-heading">
          <h1>{title}</h1>
        </div>
      )}
      {settings?.archiveIntro && (
        <p className="mb-8 max-w-[640px] opacity-80">{settings.archiveIntro}</p>
      )}

      {posts.length === 0 ? (
        <p className="empty-state">No posts published yet - add one in the admin panel.</p>
      ) : (
        <div className={`blog-archive__${layout}`}>
          {posts.map((post) => {
            const image = post.featuredImage && typeof post.featuredImage === 'object' ? (post.featuredImage as Media) : null
            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="blog-card block">
                {image?.url && (
                  <div className="blog-card__image mb-4 overflow-hidden">
                    <Image src={image.url} alt={post.title} width={640} height={420} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
                  </div>
                )}
                <div>
                  {settings?.showCategories !== false && post.categories?.length ? (
                    <span className="uppercase text-[0.7rem] tracking-[0.08em] text-[var(--color-gold)]">
                      {post.categories[0]?.name}
                    </span>
                  ) : null}
                  <h2>{post.title}</h2>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  {settings?.showDate !== false && post.publishedDate && (
                    <time dateTime={post.publishedDate} className="mt-2 block text-[0.75rem] opacity-60">
                      {new Date(post.publishedDate).toLocaleDateString()}
                    </time>
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
