import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Metadata } from 'next'

import { orderBlogPosts } from '@/features/editScreens/blogOrder'
import { readingTimeLabel } from '@/features/editScreens/readingTime'
import { ARCHIVE_PAGE_SIZE, categoryIndex, categoryPath, paginate, parsePage, postsInCategory, termSlug } from '@/features/siteTemplates/archiveQueries'
import { renderWithTemplate } from '@/features/siteTemplates/render'
import { getEngine } from '@/lib/engine'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { setBlockContext } from '@/lib/blockContext'
import { postArchiveItems } from '@/lib/blockContextFrom'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import type { BlogSetting, Media, Post } from '@/engage-types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
type Row = Post & { sticky?: boolean | null; readingTime?: number | null }

async function load(rawSlug: string) {
  const slug = termSlug(rawSlug)
  if (!slug) return null
  const engine = await getEngine()
  const { docs: allDocs } = (await engine.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    sort: '-publishedDate',
    limit: 0,
    depth: 1,
  })) as unknown as { docs: Row[] }
  const docs = await excludeProtected('posts', allDocs)
  const name = categoryIndex(docs).get(slug)
  if (!name) return null
  return { slug, name, posts: orderBlogPosts(postsInCategory(docs, slug)) as Row[] }
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params
  const page = parsePage((await searchParams).page)
  const term = await load(slug).catch((): null => null)
  if (!term) return { title: 'Not found', robots: { index: false, follow: false } }
  const meta = await buildMetadata({ title: term.name, path: categoryPath(term.slug, page) })
  // Paged archives past page 1 stay out of the index; the canonical points at the page itself.
  return page > 1 ? { ...meta, robots: { index: false, follow: true } } : meta
}

export default async function CategoryArchivePage({ params, searchParams }: Params) {
  const flags = await getFeatureFlags()
  if (!flags.blog) notFound()
  const { slug } = await params
  const term = await load(slug)
  if (!term) notFound()

  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'blog-settings' }).catch((): null => null)) as BlogSetting | null
  const perPage = settings?.postsPerPage || ARCHIVE_PAGE_SIZE
  const paged = paginate(term.posts, parsePage((await searchParams).page), perPage)
  const path = `/blog/category/${term.slug}`
  setBlockContext({ page: { title: term.name }, path, archive: { basePath: path, page: paged.page, pages: paged.pages, items: postArchiveItems(paged.items) } })

  const body = (
    <div className="page-shell">
      <div className="section-heading">
        <h1>{term.name}</h1>
      </div>
      <div className={`blog-archive__${settings?.archiveLayout || 'grid'}`}>
        {paged.items.map((post) => {
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
      {paged.pages > 1 && (
        <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
          {paged.page > 1 ? <Link href={categoryPath(term.slug, paged.page - 1)} rel="prev">Newer posts</Link> : <span />}
          <span className="opacity-60">Page {paged.page} of {paged.pages}</span>
          {paged.page < paged.pages ? <Link href={categoryPath(term.slug, paged.page + 1)} rel="next">Older posts</Link> : <span />}
        </nav>
      )}
    </div>
  )
  return renderWithTemplate({ kind: 'archive-category', ctx: { path, postCategories: [term.name] }, content: body })
}
