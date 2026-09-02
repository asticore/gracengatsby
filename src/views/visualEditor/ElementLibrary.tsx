'use client'

import React, { useMemo, useState } from 'react'

import { BLOCK_CATEGORIES, VISUAL_BLOCKS, type BlockDef } from './blockSchemas'

/**
 * The browsable element library.
 *
 * Opens as an overlay panel, groups blocks by category, and filters as you
 * type. Every insertion point on the canvas opens this same panel, so there is
 * one consistent way to add anything anywhere.
 */
export const ElementLibrary: React.FC<{
  onPick: (blockType: string) => void
  onClose: () => void
  /** Heading shown at the top, e.g. "Add to column 2". */
  title?: string
}> = ({ onPick, onClose, title = 'Add an element' }) => {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return VISUAL_BLOCKS.filter((block) => {
      if (category !== 'all' && block.category !== category) return false
      if (!needle) return true
      return (
        block.label.toLowerCase().includes(needle) ||
        block.description.toLowerCase().includes(needle) ||
        block.slug.toLowerCase().includes(needle)
      )
    })
  }, [query, category])

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
    <div className="ve-modal-overlay" onClick={onClose} role="presentation">
      <div className="ve-modal ve-library" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="ve-modal__header">
          <strong>{title}</strong>
          <button type="button" className="ve-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="ve-library__controls">
          <input
            type="search"
            className="ve-library__search"
            placeholder="Search elements…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
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
        </div>

        <div className="ve-modal__body">
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
                      onClick={() => onPick(block.slug)}
                    >
                      <span className="ve-library__card-icon">{block.icon}</span>
                      <span className="ve-library__card-label">{block.label}</span>
                      <span className="ve-library__card-desc">{block.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}