'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { TEMPLATE_CATEGORY_OPTIONS, TEMPLATE_PRESETS, type TemplateKind } from './templatePresets'
import { renderTemplateThumbnail, type ThumbnailPalette } from './templateThumbnail'

/** Fired on `window` after a template is saved so the browser refreshes "My templates". */
export const TEMPLATES_CHANGED_EVENT = 've-templates-changed'

type Filter = 'all' | 'page' | 'section' | 'mine'
type Origin = 'starter' | 'mine' | 'repo'

type PageTemplateDoc = {
  id: number | string
  name?: string | null
  description?: string | null
  kind?: string | null
  category?: string | null
  blocks?: SectionNode[]
  previewImage?: { url?: string | null } | number | string | null
}

type RepoItem = {
  repoIndex: number
  repoLabel: string
  slug: string
  title: string
  kind: string
  category: string
  categoryLabel?: string
  tags?: string[]
  previewUrl: string
}

type Card = {
  key: string
  origin: Origin
  name: string
  description: string
  kind: TemplateKind
  category: string
  categoryLabel: string
  tags: string[]
  /** Local templates carry their blocks; repository ones are fetched on click. */
  blocks?: () => SectionNode[]
  image?: string
  repo?: { index: number; slug: string }
  disabled?: boolean
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(TEMPLATE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]))

const asKind = (value: unknown): TemplateKind => (value === 'section' ? 'section' : 'page')

const asNodes = (value: unknown): SectionNode[] => (Array.isArray(value) ? (value as SectionNode[]) : [])

/** Native HTML5 drag payload for a template card: the blocks it would insert, dropped by VisualEditor.tsx. */
const dragTemplate = (e: React.DragEvent, blocks: SectionNode[]) => {
  e.dataTransfer.setData('application/x-ve-template', JSON.stringify(blocks))
  e.dataTransfer.effectAllowed = 'copy'
}

const PALETTE_VARS: Array<[keyof ThumbnailPalette, string]> = [
  ['bg', '--ve-surface-alt'],
  ['surface', '--ve-surface'],
  ['ink', '--ve-text'],
  ['muted', '--ve-border-strong'],
  ['accent', '--ve-accent'],
  ['line', '--ve-border'],
]

const readPalette = (el: HTMLElement | null): Partial<ThumbnailPalette> => {
  if (!el || typeof window === 'undefined') return {}
  const style = window.getComputedStyle(el)
  const palette: Partial<ThumbnailPalette> = {}
  for (const [key, variable] of PALETTE_VARS) {
    const value = style.getPropertyValue(variable).trim()
    if (value) palette[key] = value
  }
  return palette
}

const previewUrlOf = (doc: PageTemplateDoc): string | undefined => {
  const image = doc.previewImage
  if (image && typeof image === 'object' && typeof image.url === 'string' && image.url) return image.url
  return undefined
}

export const TemplateBrowser: React.FC<{ onPickTemplate: (blocks: SectionNode[]) => void }> = ({ onPickTemplate }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const [palette, setPalette] = useState<Partial<ThumbnailPalette>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<PageTemplateDoc[] | null>(null)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [repoItems, setRepoItems] = useState<RepoItem[]>([])
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [brokenImages, setBrokenImages] = useState<Record<string, true>>({})
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    setPalette(readPalette(rootRef.current))
  }, [])

  useEffect(() => {
    const onChanged = () => setReloadTick((t) => t + 1)
    window.addEventListener(TEMPLATES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, onChanged)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/page-templates?limit=100&depth=1&sort=-updatedAt', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((json: { docs?: PageTemplateDoc[] }) => {
        if (cancelled) return
        setDocs(Array.isArray(json?.docs) ? json.docs : [])
        setDocsError(null)
      })
      .catch((err) => {
        if (!cancelled) setDocsError(String((err as Error)?.message || err))
      })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  // Repository templates: fetched once. Any refusal (not signed in with the right role, feature off, route
  // missing) or an empty list just hides the source - it is optional.
  useEffect(() => {
    let cancelled = false
    fetch('/api/template-repos', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((json: { templates?: RepoItem[] } | null) => {
        if (cancelled || !json || !Array.isArray(json.templates)) return
        setRepoItems(json.templates)
      })
      .catch((): void => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const cards = useMemo(() => {
    const list: Card[] = []
    for (const preset of TEMPLATE_PRESETS) {
      list.push({
        key: `starter:${preset.slug}`,
        origin: 'starter',
        name: preset.name,
        description: preset.description,
        kind: preset.kind,
        category: preset.category,
        categoryLabel: CATEGORY_LABELS[preset.category] || 'Other',
        tags: [],
        blocks: preset.blocks,
        image: renderTemplateThumbnail(preset.blocks(), palette),
      })
    }
    for (const doc of docs || []) {
      const blocks = asNodes(doc.blocks)
      const cat = doc.category && CATEGORY_LABELS[doc.category] ? doc.category : 'other'
      list.push({
        key: `mine:${doc.id}`,
        origin: 'mine',
        name: doc.name || 'Untitled',
        description: doc.description || (blocks.length > 0 ? `${blocks.length} block${blocks.length === 1 ? '' : 's'}` : 'Empty template'),
        kind: asKind(doc.kind),
        category: cat,
        categoryLabel: CATEGORY_LABELS[cat],
        tags: [],
        blocks: () => blocks,
        image: previewUrlOf(doc) || renderTemplateThumbnail(blocks, palette),
        disabled: blocks.length === 0,
      })
    }
    for (const item of repoItems) {
      const cat = item.category || 'other'
      list.push({
        key: `repo:${item.repoIndex}:${item.slug}`,
        origin: 'repo',
        name: item.title || item.slug,
        description: item.repoLabel,
        kind: asKind(item.kind),
        category: cat,
        categoryLabel: item.categoryLabel || CATEGORY_LABELS[cat] || cat,
        tags: item.tags || [],
        image: item.previewUrl || undefined,
        repo: { index: item.repoIndex, slug: item.slug },
      })
    }
    return list
  }, [docs, repoItems, palette])

  // Cards that pass the top filter and the search box; the category dropdown counts come from these.
  const byFilter = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
      if (filter === 'mine' && card.origin !== 'mine') return false
      if ((filter === 'page' || filter === 'section') && card.kind !== filter) return false
      if (!needle) return true
      return (
        card.name.toLowerCase().includes(needle) ||
        card.description.toLowerCase().includes(needle) ||
        card.categoryLabel.toLowerCase().includes(needle) ||
        card.tags.some((tag) => tag.toLowerCase().includes(needle))
      )
    })
  }, [cards, filter, query])

  const categoryChoices = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const card of byFilter) {
      const entry = counts.get(card.category)
      if (entry) entry.count += 1
      else counts.set(card.category, { label: card.categoryLabel, count: 1 })
    }
    const known = TEMPLATE_CATEGORY_OPTIONS.map((o) => o.value as string).filter((v) => counts.has(v))
    const extra = [...counts.keys()].filter((k) => !CATEGORY_LABELS[k]).sort()
    return [...known, ...extra].map((key) => ({ key, ...(counts.get(key) as { label: string; count: number }) }))
  }, [byFilter])

  const activeCategory = category === 'all' || categoryChoices.some((c) => c.key === category) ? category : 'all'
  const visible = activeCategory === 'all' ? byFilter : byFilter.filter((card) => card.category === activeCategory)

  const pickRepo = useCallback(
    async (card: Card) => {
      if (!card.repo || loadingKey) return
      setLoadingKey(card.key)
      try {
        const res = await fetch(`/api/template-repos/template?repo=${encodeURIComponent(String(card.repo.index))}&slug=${encodeURIComponent(card.repo.slug)}`, {
          credentials: 'include',
        })
        const json = (await res.json().catch((): null => null)) as { ok?: boolean; error?: string; template?: { tree?: unknown }; tree?: unknown } | null
        const tree = asNodes(json?.template?.tree ?? json?.tree)
        if (!res.ok || !json || json.ok === false || tree.length === 0) {
          throw new Error(json?.error || 'That template could not be loaded.')
        }
        onPickTemplate(tree)
      } catch (err) {
        setToast(`Could not add "${card.name}": ${(err as Error)?.message || 'something went wrong.'}`)
      } finally {
        setLoadingKey(null)
      }
    },
    [loadingKey, onPickTemplate],
  )

  const onPick = (card: Card) => {
    if (card.disabled) return
    if (card.repo) {
      void pickRepo(card)
      return
    }
    if (card.blocks) onPickTemplate(card.blocks())
  }

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'page', label: 'Page' },
    { key: 'section', label: 'Section' },
    { key: 'mine', label: 'My templates' },
  ]

  const emptyMessage = (): string => {
    if (filter === 'mine') {
      if (docsError) return `Couldn't load your templates: ${docsError}`
      if (docs === null) return 'Loading...'
      if (query.trim() || docs.length > 0) return 'None of your templates match. Try a different search or category.'
      return 'You have not saved any templates yet. Use "Save as template" in the top bar to keep a section or a whole page for later.'
    }
    return 'No templates match. Try a different search, category or filter.'
  }

  return (
    <div className="ve-tpl" ref={rootRef}>
      <div className="ve-tpl__filters" role="group" aria-label="Template type">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`ve-tpl__filter ${filter === f.key ? 've-tpl__filter--active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <select className="ve-tpl__select" aria-label="Template category" value={activeCategory} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">All categories ({byFilter.length})</option>
        {categoryChoices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.count})
          </option>
        ))}
      </select>

      <input
        type="search"
        className="ve-library__search"
        placeholder="Search templates..."
        aria-label="Search templates"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {docsError && filter !== 'mine' && <p className="ve-library__empty">Couldn&apos;t load your saved templates: {docsError}</p>}

      {visible.length === 0 ? (
        <p className="ve-library__empty">{emptyMessage()}</p>
      ) : (
        <div className="ve-tpl__grid">
          {visible.map((card) => {
            const loading = loadingKey === card.key
            const showImage = card.image && !brokenImages[card.key]
            return (
              <button
                key={card.key}
                type="button"
                className="ve-tpl__card"
                draggable={Boolean(card.blocks) && !card.disabled}
                onDragStart={(e) => card.blocks && dragTemplate(e, card.blocks())}
                onClick={() => onPick(card)}
                disabled={card.disabled || (loadingKey !== null && !loading)}
                aria-busy={loading}
                aria-label={`Insert template ${card.name}`}
                title={card.description}
              >
                <span className="ve-tpl__thumb">
                  {showImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.image}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      onError={() => setBrokenImages((prev) => ({ ...prev, [card.key]: true }))}
                    />
                  ) : (
                    <span className="ve-tpl__thumb-empty">No preview</span>
                  )}
                  {loading && <span className="ve-tpl__loading">Adding...</span>}
                </span>
                <span className="ve-tpl__name">{card.name}</span>
                <span className="ve-tpl__chips">
                  <span className="ve-tpl__chip">{card.categoryLabel}</span>
                  {card.origin === 'repo' && <span className="ve-tpl__chip ve-tpl__chip--repo">Repository</span>}
                  {card.origin === 'mine' && <span className="ve-tpl__chip ve-tpl__chip--mine">{card.kind === 'section' ? 'Section' : 'Page'}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="ve-tpl__toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  )
}
