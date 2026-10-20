'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { BLOCK_CATEGORIES, libraryCards, type BlockDef } from './blockSchemas'
import { globalCards, globalNode, type GlobalCard } from './libraryGlobals'
import { TemplateBrowser } from './TemplateBrowser'
import { FAVS_KEY, RECENTS_KEY, loadList, pushRecent, saveList, toggleFavourite } from './libraryRecents'
import './navLibraryPresets.css'

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
  const [recents, setRecents] = useState<string[]>(() => loadList(RECENTS_KEY))
  const [favs, setFavs] = useState<string[]>(() => loadList(FAVS_KEY))

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
                        title={block.description}
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
    <div className="ve-library">
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
            <input
              type="search"
              className="ve-library__search"
              placeholder="Search elements…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="ve-library__tabs">
              <button
                type="button"
                className={`ve-library__tab ${category === 'all' ? 've-library__tab--active' : ''}`}
                onClick={() => setCategory('all')}
              >
                All
              </button>
              {BLOCK_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  className={`ve-library__tab ${category === cat.key ? 've-library__tab--active' : ''}`}
                  onClick={() => setCategory(cat.key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
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
                      title={g.description || 'Edits to this global section update every page that uses it.'}
                    >
                      <span className="ve-library__card-icon">{String.fromCodePoint(0x1f310)}</span>
                      <span className="ve-library__card-label">{g.name}</span>
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
