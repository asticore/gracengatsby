import Link from 'next/link'
import React from 'react'

import { getBlockContext } from '@/lib/blockContext'
import { formatTagPrice } from '@/lib/dynamicTags'
import { buildBreadcrumbs, formatPostMeta } from '@/lib/templateWidgets'

/** Wave 63 template widgets. Async server components reading the per-request block context (public data only). */

type P = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const currentTitle = (): string => {
  const c = getBlockContext()
  return str(c.post?.title) || str(c.product?.title) || str(c.event?.title) || str(c.page?.title)
}

export async function PostTitleElement(props: P): Promise<React.ReactElement | null> {
  const title = currentTitle()
  if (!title) return null
  const tag = HEADINGS.has(str(props.level)) ? str(props.level) : 'h1'
  return React.createElement(tag, { className: 'post-title' }, title)
}

export async function PostFeaturedImageElement(): Promise<React.ReactElement | null> {
  const c = getBlockContext()
  // Posts use their featured image; product templates use the product's first image.
  const img = c.post?.featuredImage ?? c.product?.featuredImage
  const url = str(img?.url)
  if (!url) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="post-featured-image" src={url} alt={str(img?.alt)} style={{ width: '100%', height: 'auto' }} />
}

export async function PostExcerptElement(): Promise<React.ReactElement | null> {
  const excerpt = str(getBlockContext().post?.excerpt)
  return excerpt ? <p className="post-excerpt">{excerpt}</p> : null
}

export async function PostMetaElement(props: P): Promise<React.ReactElement | null> {
  const post = getBlockContext().post
  if (!post) return null
  const parts = formatPostMeta(post, {
    author: props.showAuthor !== false,
    date: props.showDate !== false,
    categories: props.showCategories !== false,
    dateFormat: props.format === 'short' ? 'short' : 'long',
  })
  return parts.length ? <p className="post-meta">{parts.join(' · ')}</p> : null
}

export async function ProductPriceElement(): Promise<React.ReactElement | null> {
  const price = getBlockContext().product?.price
  if (price === undefined || price === null || price === '') return null
  const text = formatTagPrice(price)
  return text ? <p className="product-price">{text}</p> : null
}

export async function BreadcrumbsElement(props: P): Promise<React.ReactElement | null> {
  const ctx = getBlockContext()
  if (!ctx.path) return null
  const crumbs = buildBreadcrumbs(ctx.path, currentTitle(), str(props.homeLabel) || 'Home')
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

export const WAVE63_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'post-title': PostTitleElement as unknown as React.ComponentType<P>,
  'post-featured-image': PostFeaturedImageElement as unknown as React.ComponentType<P>,
  'post-excerpt': PostExcerptElement as unknown as React.ComponentType<P>,
  'post-meta': PostMetaElement as unknown as React.ComponentType<P>,
  'product-price': ProductPriceElement as unknown as React.ComponentType<P>,
  'auto-breadcrumbs': BreadcrumbsElement as unknown as React.ComponentType<P>,
}
