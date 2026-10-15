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
import { orderBlogPosts } from '@/features/editScreens/blogOrder'
import { readingTimeLabel } from '@/features/editScreens/readingTime'
import { getSeoContext } from '@/features/seo/settings'
import { listBreadcrumbs } from '@/features/seo/schemaNodes'
import { renderWithTemplate } from '@/features/siteTemplates/render'
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

  // All published posts, so sticky posts can sit above newer ones; then cut to the page size.
  const { docs } = (await engine.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    sort: '-publishedDate',
    limit: 0,
    depth: 1,
  })) as unknown as { docs: (Post & { sticky?: boolean | null; readingTime?: number | null })[] }
  const posts = orderBlogPosts(docs).slice(0, settings?.postsPerPage || 9)

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
        breadcrumbs: listBreadcrumbs({ baseUrl: context.baseUrl, path: '/blog', name: 'Blog' }),
      })
    : null

  const body = (
    <div className="page-shell">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll('</', '<\\/') }}
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
            const readTime = readingTimeLabel(post.readingTime)
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
                  {readTime && <span className="mt-1 block text-[0.75rem] opacity-60">{readTime}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
  return renderWithTemplate({ kind: 'archive-blog', ctx: { path: '/blog' }, content: body })
}
