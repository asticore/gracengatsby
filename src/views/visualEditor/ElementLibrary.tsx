'use client'

import React, { useMemo, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { BLOCK_CATEGORIES, libraryCards, type BlockDef } from './blockSchemas'
import { TemplateBrowser } from './TemplateBrowser'

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

  const grouped = useMemo(() => {
    const map = new Map<string, BlockDef[]>()
    for (const block of results) {
      const list = map.get(block.category) || []
      list.push(block)
      map.set(block.category, list)
    }
    return map
  }, [results])

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

            {BLOCK_CATEGORIES.map((cat) => {
              const blocks = grouped.get(cat.key)
              if (!blocks || blocks.length === 0) return null
              return (
                <div className="ve-library__group" key={cat.key}>
                  <h4 className="ve-library__group-title">{cat.label}</h4>
                  <div className="ve-library__grid">
                    {blocks.map((block) => (
                      <button
                        key={block.slug}
                        type="button"
                        className="ve-library__card"
                        draggable
                        onDragStart={(e) => {
                          // Native HTML5 DnD, not @dnd-kit - it's the only thing that
                          // can hand a drag off across the canvas iframe boundary, since
                          // dataTransfer belongs to the browser's drag session rather
                          // than either document. See Canvas.tsx's InsertSlot.
                          e.dataTransfer.setData('application/x-ve-block', block.slug)
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => onPickBlock(block.slug)}
                        title={block.description}
                      >
                        <span className="ve-library__card-icon">{block.icon}</span>
                        <span className="ve-library__card-label">{block.label}</span>
                      </button>
                    ))}
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
