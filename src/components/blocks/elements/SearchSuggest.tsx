'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

import { enterTarget, navReduce, parseSuggestions, type NavState, type SuggestItem } from './searchSuggestLogic'

type Props = { placeholder: string; button: string; maxResults: number; showType: boolean }

/**
 * Live search combobox. Server renders the same GET form that works without JS; after hydration the input gains
 * suggestions from /api/search-suggest. Results are rendered as React text nodes only (never HTML).
 */
export default function SearchSuggest({ placeholder, button, maxResults, showType }: Props) {
  const uid = useId()
  const listId = `${uid}-list`
  const [value, setValue] = useState('')
  const [items, setItems] = useState<SuggestItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [nav, setNav] = useState<NavState>({ open: false, active: -1 })
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLFormElement | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setNav({ open: false, active: -1 })
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const onChange = (next: string) => {
    setValue(next)
    cancel()
    const q = next.trim()
    if (q.length < 2) {
      setItems([])
      setLoaded(false)
      setNav({ open: false, active: -1 })
      return
    }
    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
        if (!res.ok) throw new Error('bad')
        const list = parseSuggestions(await res.json(), maxResults)
        setItems(list)
        setLoaded(true)
        setNav({ open: true, active: -1 })
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setItems([])
        setLoaded(false)
        setNav({ open: false, active: -1 })
      }
    }, 200)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = items.length
    const map: Record<string, 'down' | 'up' | 'escape' | 'home' | 'end'> = { ArrowDown: 'down', ArrowUp: 'up', Escape: 'escape' }
    if (e.key === 'Enter') {
      const target = enterTarget(nav, items)
      if (target) {
        e.preventDefault()
        window.location.assign(target)
      }
      return
    }
    const type = map[e.key]
    if (!type) return
    if (type === 'escape' && !nav.open) return
    if (type !== 'escape' && count === 0) return
    e.preventDefault()
    setNav((s) => navReduce(s, { type }, count))
  }

  const showBox = nav.open && loaded
  const activeId = showBox && nav.active >= 0 ? `${uid}-opt-${nav.active}` : undefined

  return (
    <form ref={rootRef} className="be-el-search be-el-search--live" role="search" action="/search" method="get">
      <div className="be-el-search__field be-el-search__wrap">
        <label>
          <span className="be-el-search__sr">Search the site</span>
          <input
          className="be-el-search__input"
          type="search"
          name="q"
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showBox}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => loaded && setNav((s) => (s.open ? s : { open: true, active: -1 }))}
          />
        </label>
        <ul id={listId} role="listbox" className="be-el-search__list" hidden={!showBox} aria-label="Search suggestions">
          {showBox && items.length === 0 && (
            <li role="presentation" className="be-el-search__empty">
              No results
            </li>
          )}
          {showBox &&
            items.map((it, i) => (
              <li key={`${it.url}-${i}`} id={`${uid}-opt-${i}`} role="option" aria-selected={i === nav.active} className="be-el-search__opt">
                <a href={it.url} tabIndex={-1} onMouseDown={(e) => e.preventDefault()}>
                  <span className="be-el-search__opt-title">{it.title}</span>
                  {showType && it.type && <span className="be-el-search__opt-type">{it.type}</span>}
                  {it.excerpt && <span className="be-el-search__opt-excerpt">{it.excerpt}</span>}
                </a>
              </li>
            ))}
        </ul>
        <span className="be-el-search__sr" role="status" aria-live="polite">
          {showBox ? (items.length ? `${items.length} suggestions available` : 'No results') : ''}
        </span>
      </div>
      <button className="be-el-search__btn" type="submit">
        {button}
      </button>
    </form>
  )
}
