'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { BLOCK_CATEGORIES, libraryCards, type BlockDef } from './blockSchemas'
import { globalCards, globalNode, type GlobalCard } from './libraryGlobals'
import { commercePresetCards, commercePresetNode, filterCommercePresetCards } from './libraryCommercePresets'
import { createFormFromPreset, filterFormPresetCards, formPresetCards } from './libraryFormPresets'
import { TemplateBrowser } from './TemplateBrowser'
import { FAVS_KEY, RECENTS_KEY, loadList, pushRecent, saveList, toggleFavourite } from './libraryRecents'
import './navLibraryPresets.css'

const CATEGORY_KEY = 've-library-category'
const DENSITY_KEY = 've-library-density'

type Source = 'blocks' | 'templates'

/**
 * The Elements tab of the editor dock (src/views/VisualEditor.tsx renders it
 * permanently on the left, alongside the Settings tab - see that file for
 * why this stopped being a popup: Elementor doesn't make you close a modal
 * to see the canvas, and neither should this).
 *
 * Two sources, picked with the pill tabs at the top: raw Blocks (search +
 * category, same as before) and Templates - either a curated multi-block
 * starter (templatePresets.ts) or a saved Page Template or a repository template (see TemplateBrowser.tsx). Both insert at whatever target the caller
 * is tracking (see `targetLabel`, set by whichever "+" was clicked).
 */
export const ElementLibrary: React.FC<{
  targetLabel: string
  onPickBlock: (blockType: string) => void
  onPickTemplate: (blocks: SectionNode[]) => void
  /** Form builder: only layout and form fields are offered, and page templates are hidden. */
  formMode?: boolean
}> = ({ targetLabel, onPickBlock, onPickTemplate, formMode }) => {
  const [source, setSource] = useState<Source>('blocks')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const changeCategory = (key: string) => {
    setCategory(key)
    try {
      window.localStorage.setItem(CATEGORY_KEY, key)
    } catch {
      /* storage unavailable */
    }
  }
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact')
  const toggleDensity = () => {
    const next = density === 'compact' ? 'comfortable' : 'compact'
    setDensity(next)
    try {
      window.localStorage.setItem(DENSITY_KEY, next)
    } catch {
      /* storage unavailable */
    }
  }
  const [recents, setRecents] = useState<string[]>([])
  const [favs, setFavs] = useState<string[]>([])
  // Stored values are read after mount so the first client render equals the server render.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync with localStorage after mount */
    try {
      const saved = window.localStorage.getItem(CATEGORY_KEY)
      if (saved && BLOCK_CATEGORIES.some((c) => c.key === saved)) setCategory(saved)
    } catch {
      /* storage unavailable */
    }
    try {
      if (window.localStorage.getItem(DENSITY_KEY) === 'comfortable') setDensity('comfortable')
    } catch {
      /* storage unavailable */
    }
    setRecents(loadList(RECENTS_KEY))
    setFavs(loadList(FAVS_KEY))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const pick = useCallback(
    (slug: string) => {
      const next = pushRecent(recents, slug)
      setRecents(next)
      saveList(RECENTS_KEY, next)
      onPickBlock(slug)
    },
    [recents, onPickBlock],
  )
  const toggleFav = (slug: string) => {
    const next = toggleFavourite(favs, slug)
    setFavs(next)
    saveList(FAVS_KEY, next)
  }

  const [globals, setGlobals] = useState<GlobalCard[]>([])
  useEffect(() => {
    if (formMode) return
    let cancelled = false
    fetch('/api/reusable-sections?limit=100&depth=0&sort=name', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ docs?: unknown }>) : null))
      .then((json) => {
        if (!cancelled && json) setGlobals(globalCards(json.docs))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [formMode])
  const globalMatches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return globals.filter((g) => !needle || g.name.toLowerCase().includes(needle) || g.description.toLowerCase().includes(needle) || 'global'.includes(needle))
  }, [globals, query])

  /** Inserting a preset first creates a saved form document (the form block renders only saved forms). */
  const FORM_PRESET_INSERT_READY = true
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [formBusy, setFormBusy] = useState(false)

  const formCards = useMemo(() => filterFormPresetCards(formPresetCards(), query), [query])

  const shopCards = useMemo(() => filterCommercePresetCards(commercePresetCards(), query), [query])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return libraryCards({ formMode }).filter((block) => {
      if (category !== 'all' && block.category !== category) return false
      if (!needle) return true
      return (
        block.label.toLowerCase().includes(needle) ||
        block.description.toLowerCase().includes(needle) ||
        block.slug.toLowerCase().includes(needle)
      )
    })
  }, [query, category, formMode])

  const allCards = useMemo(() => libraryCards({ formMode }), [formMode])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of allCards) m.set(b.category, (m.get(b.category) || 0) + 1)
    return m
  }, [allCards])

  const bySlug = useMemo(() => new Map(libraryCards({ formMode }).map((b) => [b.slug, b])), [formMode])
  const recentBlocks = recents.map((s) => bySlug.get(s)).filter((b): b is BlockDef => Boolean(b))
  const favBlocks = favs.map((s) => bySlug.get(s)).filter((b): b is BlockDef => Boolean(b))

  const grouped = useMemo(() => {
    const map = new Map<string, BlockDef[]>()
    for (const block of results) {
      const list = map.get(block.category) || []
      list.push(block)
      map.set(block.category, list)
    }
    return map
  }, [results])

  const renderCard = (block: BlockDef) => (
                                          <div
                        key={block.slug}
                        role="button"
                        tabIndex={0}
                        className="ve-library__card"
                        draggable
                        onDragStart={(e) => {
                          // Native HTML5 DnD, not @dnd-kit - it's the only thing that
                          // can hand a drag off across the canvas iframe boundary, since
                          // dataTransfer belongs to the browser's drag session rather
                          // than either document. Cards are divs, not buttons: Firefox/Safari don't start a drag
                          // from a <button>. The drop is handled in VisualEditor.tsx.
                          e.dataTransfer.setData('application/x-ve-block', block.slug)
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => pick(block.slug)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            pick(block.slug)
                          }
                        }}
                        title={`${block.label}: ${block.description}`}
                        aria-label={`${block.label}: ${block.description}`}
                      >
                        <span className="ve-library__card-icon">{block.icon}</span>
                        <span className="ve-library__card-label">{block.label}</span>
                        <button
                          type="button"
                          className={`ve-lib-star${favs.includes(block.slug) ? ' ve-lib-star--on' : ''}`}
                          aria-label={favs.includes(block.slug) ? `Remove ${block.label} from favourites` : `Add ${block.label} to favourites`}
                          aria-pressed={favs.includes(block.slug)}
                          draggable={false}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFav(block.slug)
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {favs.includes(block.slug) ? String.fromCharCode(9733) : String.fromCharCode(9734)}
                        </button>
                      </div>
                      )

  return (
    <div className={`ve-library ve-library--${density}`} data-density={density}>
      <div className="ve-library__controls">
        <div className="ve-library__source-tabs" role="tablist" aria-label="Element source">
          <button
            type="button"
            role="tab"
            aria-selected={source === 'blocks'}
            className={`ve-library__source-tab ${source === 'blocks' ? 've-library__source-tab--active' : ''}`}
            onClick={() => setSource('blocks')}
          >
            Blocks
          </button>
          {!formMode && (
            <button
              type="button"
              role="tab"
              aria-selected={source === 'templates'}
              className={`ve-library__source-tab ${source === 'templates' ? 've-library__source-tab--active' : ''}`}
              onClick={() => setSource('templates')}
            >
              Templates
            </button>
          )}
        </div>

        {source === 'blocks' && (
          <>
            <div className="ve-library__filter-row">
            <input
              type="search"
              className="ve-library__search"
              placeholder="Search elements…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="ve-library__filter"
              aria-label="Filter elements"
              data-testid="ve-lib-filter"
              value={category}
              onChange={(e) => changeCategory(e.target.value)}
            >
              <option value="all">All categories ({allCards.length})</option>
              {BLOCK_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.label} ({counts.get(cat.key) || 0})
                </option>
              ))}
            </select>
            </div>
            <button
              type="button"
              className="ve-library__density"
              data-testid="ve-lib-density"
              aria-pressed={density === 'comfortable'}
              onClick={toggleDensity}
            >
              {density === 'compact' ? 'Comfortable view' : 'Compact view'}
            </button>
          </>
        )}
      </div>

      <div className="ve-library__body">
        <p className="ve-library__hint">Adding to: {targetLabel}</p>

        {source === 'blocks' ? (
          <>
            {results.length === 0 && <p className="ve-library__empty">No elements match &quot;{query}&quot;.</p>}

            {!query.trim() && category === 'all' && favBlocks.length > 0 && (
              <div className="ve-library__group ve-lib-recent" data-testid="ve-lib-favs">
                <h4 className="ve-library__group-title">Favourites</h4>
                <div className="ve-library__grid">{favBlocks.map((b) => renderCard(b))}</div>
              </div>
            )}
            {!query.trim() && category === 'all' && recentBlocks.length > 0 && (
              <div className="ve-library__group ve-lib-recent" data-testid="ve-lib-recent">
                <h4 className="ve-library__group-title">Recently used</h4>
                <div className="ve-library__grid">{recentBlocks.map((b) => renderCard(b))}</div>
              </div>
            )}

            {category === 'all' && globalMatches.length > 0 && (
              <div className="ve-library__group" data-testid="ve-lib-globals">
                <h4 className="ve-library__group-title">Global</h4>
                <div className="ve-library__grid">
                  {globalMatches.map((g) => (
                    <div
                      key={g.id}
                      role="button"
                      tabIndex={0}
                      className="ve-library__card"
                      onClick={() => onPickTemplate([globalNode(g.id)])}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onPickTemplate([globalNode(g.id)])
                        }
                      }}
                      title={`${g.name}: ${g.description || 'Edits to this global section update every page that uses it.'}`}
                      aria-label={g.name}
                    >
                      <span className="ve-library__card-icon">{String.fromCodePoint(0x1f310)}</span>
                      <span className="ve-library__card-label">{g.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {FORM_PRESET_INSERT_READY && !formMode && category === 'all' && formCards.length > 0 && (
              <div className="ve-library__group" data-testid="ve-lib-forms">
                <h4 className="ve-library__group-title">Forms</h4>
                {formNotice && (
                  <p className="ve-library__empty" role="alert">
                    {formNotice}
                  </p>
                )}
                <div className="ve-library__grid">
                  {formCards.map((f) => {
                    const insert = async () => {
                      if (formBusy) return
                      setFormBusy(true)
                      setFormNotice(null)
                      const result = await createFormFromPreset(f.id)
                      setFormBusy(false)
                      if ('node' in result) onPickTemplate([result.node])
                      else setFormNotice(result.error)
                    }
                    return (
                      <div
                        key={f.id}
                        role="button"
                        tabIndex={0}
                        className="ve-library__card"
                        onClick={() => void insert()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void insert()
                          }
                        }}
                        title={`${f.label}: ${f.description}`}
                        aria-label={f.label}
                      >
                        <span className="ve-library__card-icon">{String.fromCodePoint(0x1f4dd)}</span>
                        <span className="ve-library__card-label">{f.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!formMode && category === 'all' && shopCards.length > 0 && (
              <div className="ve-library__group" data-testid="ve-lib-shop">
                <h4 className="ve-library__group-title">Shop</h4>
                <div className="ve-library__grid">
                  {shopCards.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      className="ve-library__card"
                      onClick={() => onPickTemplate([commercePresetNode(c.id)!])}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onPickTemplate([commercePresetNode(c.id)!])
                        }
                      }}
                      title={`${c.label}: ${c.description}`}
                      aria-label={c.label}
                    >
                      <span className="ve-library__card-icon">{String.fromCodePoint(0x1f6d2)}</span>
                      <span className="ve-library__card-label">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {BLOCK_CATEGORIES.map((cat) => {
              const blocks = grouped.get(cat.key)
              if (!blocks || blocks.length === 0) return null
              return (
                <div className="ve-library__group" key={cat.key}>
                  <h4 className="ve-library__group-title">{cat.label}</h4>
                  <div className="ve-library__grid">
                    {blocks.map((block) => renderCard(block))}
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <TemplateBrowser onPickTemplate={onPickTemplate} />
        )}
      </div>
    </div>
  )
}
