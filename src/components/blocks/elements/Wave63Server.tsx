import Link from 'next/link'
import React from 'react'

import { getBlockContext } from '@/lib/blockContext'
import { formatTagDate, formatTagPrice } from '@/lib/dynamicTags'
import { archivePageHref, buildBreadcrumbs, formatPostMeta } from '@/lib/templateWidgets'
import { localizeForRequest } from '@/features/multilingual/requestLinkLocale'
import { loopItemOf } from '@/features/siteTemplates/loopGrid'

/** Wave 63 template widgets. Async server components reading the per-request block context (public data only). */

type P = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const currentTitle = (): string => {
  const c = getBlockContext()
  return str(c.post?.title) || str(c.product?.title) || str(c.event?.title) || str(c.page?.title)
}

export async function PostTitleElement(props: P): Promise<React.ReactElement | null> {
  // Inside a loop grid the item is the card's own; elsewhere it is the page being viewed.
  const title = loopItemOf(props)?.title ?? currentTitle()
  if (!title) return null
  const tag = HEADINGS.has(str(props.level)) ? str(props.level) : 'h1'
  return React.createElement(tag, { className: 'post-title' }, title)
}

export async function PostFeaturedImageElement(props: P): Promise<React.ReactElement | null> {
  const item = loopItemOf(props)
  const c = getBlockContext()
  // Posts use their featured image; product templates use the product's first image.
  const img = item ? item.image : (c.post?.featuredImage ?? c.product?.featuredImage)
  const url = str(img?.url)
  if (!url) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="post-featured-image" src={url} alt={str(img?.alt)} style={{ width: '100%', height: 'auto' }} />
}

export async function PostExcerptElement(props: P): Promise<React.ReactElement | null> {
  const excerpt = str(loopItemOf(props)?.excerpt ?? getBlockContext().post?.excerpt)
  return excerpt ? <p className="post-excerpt">{excerpt}</p> : null
}

export async function PostMetaElement(props: P): Promise<React.ReactElement | null> {
  const item = loopItemOf(props)
  const post = item ? { author: item.author, date: item.date, categories: item.categories } : getBlockContext().post
  if (!post) return null
  const parts = formatPostMeta(post, {
    author: props.showAuthor !== false,
    date: props.showDate !== false,
    categories: props.showCategories !== false,
    dateFormat: props.format === 'short' ? 'short' : 'long',
  })
  return parts.length ? <p className="post-meta">{parts.join(' · ')}</p> : null
}

export async function ProductPriceElement(props: P): Promise<React.ReactElement | null> {
  const item = loopItemOf(props)
  const price = item ? item.price : getBlockContext().product?.price
  if (price === undefined || price === null || price === '') return null
  const text = formatTagPrice(price)
  return text ? <p className="product-price">{text}</p> : null
}

export async function BreadcrumbsElement(props: P): Promise<React.ReactElement | null> {
  const ctx = getBlockContext()
  if (!ctx.path) return null
  const crumbs = buildBreadcrumbs(ctx.path, currentTitle(), str(props.homeLabel) || 'Home').map((c) => ({ ...c, href: localizeForRequest(c.href) }))
  if (crumbs.length < 2) return null
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', listStyle: 'none', padding: 0, margin: 0 }}>
        {crumbs.map((c, i) => (
          <li key={c.href}>
            {i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            {i < crumbs.length - 1 ? <span aria-hidden="true"> /</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export async function ArchiveGridElement(props: P): Promise<React.ReactElement | null> {
  const archive = getBlockContext().archive
  if (!archive || archive.items.length === 0) return null
  const cols = ['2', '3', '4'].includes(str(props.columns)) ? str(props.columns) : '3'
  const showImage = props.showImage !== false
  const showExcerpt = props.showExcerpt !== false
  const showDate = props.showDate !== false
  return (
    <div className="archive-grid">
      <ul className="archive-grid__items" style={{ display: 'grid', gap: '1.5rem', listStyle: 'none', padding: 0, margin: 0, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {archive.items.map((item) => {
          const date = showDate && item.date ? formatTagDate(item.date, 'long') : ''
          const price = item.price !== undefined && item.price !== null && item.price !== '' ? formatTagPrice(item.price) : ''
          return (
            <li key={item.href}>
              <Link href={item.href} className="archive-grid__item block">
                {showImage && item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image.url} alt={item.image.alt ?? ''} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
                ) : null}
                <h2 style={{ fontSize: '1.1rem' }}>{item.title}</h2>
                {showExcerpt && item.excerpt ? <p>{item.excerpt}</p> : null}
                {price ? <p className="archive-grid__price">{price}</p> : null}
                {date ? <time dateTime={String(item.date)} className="block text-[0.75rem] opacity-60">{date}</time> : null}
              </Link>
            </li>
          )
        })}
      </ul>
      {archive.pages > 1 ? (
        <nav aria-label="Pagination" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
          {archive.page > 1 ? <Link href={archivePageHref(archive.basePath, archive.page - 1)} rel="prev">Newer</Link> : <span />}
          <span className="opacity-60">Page {archive.page} of {archive.pages}</span>
          {archive.page < archive.pages ? <Link href={archivePageHref(archive.basePath, archive.page + 1)} rel="next">Older</Link> : <span />}
        </nav>
      ) : null}
    </div>
  )
}

export const WAVE63_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'post-title': PostTitleElement as unknown as React.ComponentType<P>,
  'post-featured-image': PostFeaturedImageElement as unknown as React.ComponentType<P>,
  'post-excerpt': PostExcerptElement as unknown as React.ComponentType<P>,
  'post-meta': PostMetaElement as unknown as React.ComponentType<P>,
  'product-price': ProductPriceElement as unknown as React.ComponentType<P>,
  'auto-breadcrumbs': BreadcrumbsElement as unknown as React.ComponentType<P>,
  'archive-grid': ArchiveGridElement as unknown as React.ComponentType<P>,
}
