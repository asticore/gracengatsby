/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { safeUrl } from '@/lib/mergeTags'

import { flag, num, pick, str } from './elementUtil'
import './wave47.css'
import './wave50.css'

/**
 * Wave 50 view: the Loop element (src/lib/elements/wave50Defs.ts). This file is pure and sync: it turns a list of
 * already-fetched items into markup, and builds the query. The fetch itself is in Wave50Server.tsx. Cards reuse the
 * wave-47 card classes. Everything is React text (escaped); links and picture addresses pass through safeUrl.
 */

export const LOOP_SOURCES = ['posts', 'products', 'events', 'faqs', 'pages'] as const
export type LoopSourceName = (typeof LOOP_SOURCES)[number]
const ORDER_BYS = ['date', 'title', 'menu order', 'random-stable'] as const
const ORDERS = ['asc', 'desc'] as const
const LAYOUTS = ['grid', 'list', 'carousel'] as const

/** One item as the view draws it. */
export type LoopItem = { id: string; title: string; url: string; image: string; excerpt: string; price: string; date: string }

export type LoopSettings = {
  source: LoopSourceName
  count: number
  orderBy: (typeof ORDER_BYS)[number]
  order: 'asc' | 'desc'
  category: string
  related: boolean
  layout: (typeof LAYOUTS)[number]
  columns: number
  showImage: boolean
  showExcerpt: boolean
  showDate: boolean
  showPrice: boolean
  emptyText: string
  loadMore: boolean
  pagination: boolean
  page: number
}

/** Props to settings, clamped. Unknown values fall back to the defaults. */
export function loopSettings(p: Record<string, unknown>): LoopSettings {
  return {
    source: pick(p.source, LOOP_SOURCES, 'posts'),
    count: Math.round(num(p.count, 6, 1, 24)),
    orderBy: pick(p.orderBy, ORDER_BYS, 'date'),
    order: pick(p.order, ORDERS, 'desc'),
    category: str(p.category).trim().slice(0, 120),
    related: flag(p.related, false),
    layout: pick(p.layout, LAYOUTS, 'grid'),
    columns: Math.round(num(p.columns, 3, 1, 6)),
    showImage: flag(p.showImage, true),
    showExcerpt: flag(p.showExcerpt, true),
    showDate: flag(p.showDate, true),
    showPrice: flag(p.showPrice, true),
    emptyText: str(p.emptyText, 'Nothing to show yet.'),
    loadMore: flag(p.loadMore, false),
    pagination: flag(p.pagination, false),
    page: Math.round(num(p.page ?? p.currentPage, 1, 1, 1000)),
  }
}

/** The date field each source sorts and shows by. */
export const DATE_FIELD: Record<LoopSourceName, string> = { posts: 'publishedDate', events: 'startDate', products: 'createdAt', pages: 'updatedAt', faqs: 'createdAt' }

/** Field names for the title sort and menu-order sort. FAQs have an order number; the rest fall back to title. */
export function sortField(s: Pick<LoopSettings, 'source' | 'orderBy'>): string {
  if (s.orderBy === 'title') return s.source === 'faqs' ? 'question' : 'title'
  if (s.orderBy === 'menu order') return s.source === 'faqs' ? 'order' : 'title'
  return DATE_FIELD[s.source]
}

/** The `where` clause: published only, plus the category and exclude-current filters where the source supports them. */
export function loopWhere(s: LoopSettings, currentId?: unknown): { and: Record<string, unknown>[] } {
  const and: Record<string, unknown>[] = []
  if (s.source !== 'faqs') and.push({ _status: { equals: 'published' } })
  if (s.category) {
    if (s.source === 'posts') and.push({ 'categories.name': { equals: s.category } })
    else if (s.source === 'products' || s.source === 'faqs') and.push({ category: { equals: s.category } })
    else if (s.source === 'events') and.push({ eventType: { equals: s.category } })
  }
  const cid = str(currentId)
  if (s.related && cid) and.push({ id: { not_equals: /^\d+$/.test(cid) ? Number(cid) : cid } })
  return { and }
}

/** Stable pseudo-random rank for an id, the same on every request. */
export function stableRank(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const formatDate = (raw: string): string => {
  const d = raw ? new Date(raw) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

const pageHref = (n: number) => `?page=${n}`

const Card: React.FC<{ item: LoopItem; s: LoopSettings }> = ({ item, s }) => {
  const href = safeUrl(item.url) ?? ''
  const image = s.showImage ? safeUrl(item.image) ?? '' : ''
  const dated = s.showDate && (s.source === 'posts' || s.source === 'events') && item.date
  const priced = s.showPrice && s.source === 'products' && item.price
  const body = (
    <div className={`be-el-47-card__face be-el-47-card__front--${s.layout === 'list' ? 'left' : 'top'}`}>
      {image && (
        <figure className="be-el-47-card__media be-el-47-card__media--image">
          <img className="be-el-47-card__img be-el-47-card__img--cover" src={image} alt="" loading="lazy" />
        </figure>
      )}
      <div className="be-el-47-card__body">
        <h3 className="be-el-47-card__title">{item.title}</h3>
        {dated && (
          <time className="be-el-50-loop__date" dateTime={item.date}>
            {formatDate(item.date)}
          </time>
        )}
        {priced && <p className="be-el-50-loop__price">{item.price}</p>}
        {s.showExcerpt && item.excerpt && <p className="be-el-47-card__text">{item.excerpt}</p>}
        {href && <span className="be-el-47-card__more">Read more</span>}
      </div>
    </div>
  )
  return (
    <article className="be-el-47-card be-el-47-card--left be-el-47-card--shadow-sm be-el-50-loop__card">
      {href ? (
        <a className="be-el-47-card__link" href={href} aria-label={item.title || undefined}>
          {body}
        </a>
      ) : (
        body
      )}
    </article>
  )
}

/** Plain links: previous, numbered pages and next. No script. */
const Pager: React.FC<{ s: LoopSettings; totalPages: number }> = ({ s, totalPages }) => {
  if (totalPages <= 1) return null
  const page = Math.min(s.page, totalPages)
  if (!s.pagination) {
    // Next-page link only.
    if (!s.loadMore || page >= totalPages) return null
    return (
      <nav className="be-el-50-loop__pager" aria-label="More items">
        <a className="be-el-50-loop__next" href={pageHref(page + 1)} rel="next">
          Next page
        </a>
      </nav>
    )
  }
  const nums = Array.from({ length: Math.min(totalPages, 50) }, (_, i) => i + 1)
  return (
    <nav className="be-el-50-loop__pager" aria-label="Pagination">
      {page > 1 && (
        <a href={pageHref(page - 1)} rel="prev">
          Previous
        </a>
      )}
      {nums.map((n) =>
        n === page ? (
          <span key={n} aria-current="page" className="be-el-50-loop__current">
            {n}
          </span>
        ) : (
          <a key={n} href={pageHref(n)}>
            {n}
          </a>
        ),
      )}
      {page < totalPages && (
        <a href={pageHref(page + 1)} rel="next">
          {s.loadMore ? 'Next page' : 'Next'}
        </a>
      )}
    </nav>
  )
}

/** The loop markup for fetched items. An empty list shows the empty text. */
export const LoopView: React.FC<{ settings: LoopSettings; items: LoopItem[]; totalPages?: number }> = ({ settings: s, items, totalPages = 1 }) => {
  if (items.length === 0) return <p className="be-el-50-loop be-el-50-loop--empty">{s.emptyText}</p>
  const vars = { '--be-el-50-cols': String(s.columns) } as React.CSSProperties
  return (
    <div className={`be-el-50-loop be-el-50-loop--${s.layout}`} data-source={s.source} style={vars}>
      <ul className="be-el-50-loop__items">
        {items.map((item) => (
          <li key={item.id} className="be-el-50-loop__item">
            <Card item={item} s={s} />
          </li>
        ))}
      </ul>
      <Pager s={s} totalPages={totalPages} />
    </div>
  )
}
