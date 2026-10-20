'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { BlockDef } from './blockSchemas'
import { filterQuickInsert, moveHighlight } from './quickInsert'

/**
 * Small searchable command palette opened with "/" on the canvas. Entries are the element library's
 * cards (passed in), ranked by filterQuickInsert. Arrows move, Enter inserts, Esc closes.
 */
export const QuickInsertPalette: React.FC<{
  cards: BlockDef[]
  recents: string[]
  /** Viewport position of the palette's top-left corner. */
  top: number
  left: number
  onPick: (slug: string) => void
  onClose: () => void
}> = ({ cards, recents, top, left, onPick, onClose }) => {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => filterQuickInsert(cards, query, recents, 8), [cards, query, recents])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const current = Math.min(active, Math.max(results.length - 1, 0))

  return (
    <div
      role="dialog"
      aria-label="Quick insert"
      className="ve-quick-insert"
      style={{ position: 'fixed', top, left, width: 280, zIndex: 10001, background: '#fff', color: '#111', border: '1px solid #c3c4c7', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.18)', padding: 6, font: '14px/1.3 system-ui, sans-serif' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Insert element..."
        aria-label="Search elements"
        aria-controls="ve-quick-insert-list"
        aria-activedescendant={results[current] ? `ve-qi-${results[current].slug}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onBlur={onClose}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(moveHighlight(current, e.key === 'ArrowDown' ? 1 : -1, results.length))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results[current]) onPick(results[current].slug)
          }
        }}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #8c8f94', borderRadius: 4, font: 'inherit' }}
      />
      <ul id="ve-quick-insert-list" role="listbox" style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, maxHeight: 280, overflowY: 'auto' }}>
        {results.length === 0 && <li style={{ padding: '6px 8px', color: '#646970' }}>No matching element</li>}
        {results.map((card, i) => (
          <li
            key={card.slug}
            id={`ve-qi-${card.slug}`}
            role="option"
            aria-selected={i === current}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(card.slug)
            }}
            style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: i === current ? '#e6f0fa' : 'transparent' }}
          >
            <span aria-hidden="true">{card.icon}</span>
            <span>{card.label}</span>
            {!query && recents.includes(card.slug) && <small style={{ marginLeft: 'auto', color: '#646970' }}>recent</small>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default QuickInsertPalette
