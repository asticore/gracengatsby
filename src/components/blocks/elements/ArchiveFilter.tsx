import Link from 'next/link'
import React from 'react'

import { getBlockContext } from '@/lib/blockContext'
import { isArchiveFilterActive, NO_ARCHIVE_FILTERS } from '@/features/siteTemplates/archiveFilter'

/**
 * Filter widget: a plain GET form (works without JavaScript) that writes the archive filter params
 * (?category=&tag=&min=&max=&q=&sort=) to the archive's own address. The archive pages and the Loop grid read them.
 * Renders nothing outside an archive.
 */

type P = Record<string, unknown>

const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'A to Z' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
] as const

export async function ArchiveFilterElement(props: P): Promise<React.ReactElement | null> {
  const archive = getBlockContext().archive
  if (!archive) return null
  const f = archive.filters ?? NO_ARCHIVE_FILTERS
  const facets = archive.facets ?? { categories: [], tags: [] }
  const isProducts = archive.kind === 'products'
  const path = archive.basePath.split('?')[0] || '/'

  const showSearch = flag(props.showSearch, true)
  const showCategory = flag(props.showCategory, true) && facets.categories.length > 0
  const showTag = flag(props.showTag, true) && facets.tags.length > 0
  const showPrice = flag(props.showPrice, true) && isProducts
  const showSort = flag(props.showSort, true)
  const sortOptions = SORT_OPTIONS.filter((o) => isProducts || !o.value.startsWith('price'))

  const field = 'archive-filter__field'
  return (
    <form method="get" action={path} className="archive-filter" aria-label="Filter">
      <div className="archive-filter__fields" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        {showSearch && (
          <label className={field}>
            <span>Search</span>
            <input type="search" name="q" defaultValue={f.q} maxLength={100} />
          </label>
        )}
        {showCategory && (
          <label className={field}>
            <span>Category</span>
            <select name="category" defaultValue={f.category}>
              <option value="">All categories</option>
              {facets.categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {showTag && (
          <label className={field}>
            <span>Tag</span>
            <select name="tag" defaultValue={f.tag}>
              <option value="">All tags</option>
              {facets.tags.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        {showPrice && (
          <>
            <label className={field}>
              <span>Min price</span>
              <input type="number" name="min" min={0} step="0.01" defaultValue={f.min ?? ''} />
            </label>
            <label className={field}>
              <span>Max price</span>
              <input type="number" name="max" min={0} step="0.01" defaultValue={f.max ?? ''} />
            </label>
          </>
        )}
        {showSort && (
          <label className={field}>
            <span>Sort</span>
            <select name="sort" defaultValue={f.sort}>
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="archive-filter__apply">Apply</button>
        {isArchiveFilterActive(f) && <Link href={path} className="archive-filter__clear">Clear filters</Link>}
      </div>
    </form>
  )
}
