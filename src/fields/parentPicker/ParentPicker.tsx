'use client'

import { createPortal } from 'react-dom'
import React, { useEffect, useRef, useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { pagePath } from '@/features/pagesTree/plan'
import type { TreePage } from '@/features/pagesTree/plan'

type ParentPickerProps = {
  field: Field
  path: string
  readOnly?: boolean
}

export function ParentPicker({ field, path, readOnly }: ParentPickerProps) {
  const { value, setValue } = useField<number | string | undefined | null>({ path })
  const [pages, setPages] = useState<TreePage[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Extract current page ID from URL
  const currentPageId = typeof window !== 'undefined'
    ? (() => {
        const match = window.location.pathname.match(/\/collections\/pages\/(\d+)/)
        return match ? parseInt(match[1], 10) : null
      })()
    : null

  // Fetch pages on component mount and when modal opens
  const fetchPages = async () => {
    try {
      const response = await fetch('/api/pages?limit=1000&depth=0', {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch pages')

      const data: any = await response.json()
      const pagesList = Array.isArray(data) ? data : (data.docs || [])
      const pagesArray: TreePage[] = pagesList.map((page: any) => ({
        id: Number(page.id),
        title: page.title,
        slug: page.slug,
        parent: page.parent && typeof page.parent === 'object' ? Number(page.parent.id) : page.parent ? Number(page.parent) : null,
        sortOrder: 0,
        isHomepage: page.isHomepage === true,
        status: page._status === 'draft' ? ('draft' as const) : ('published' as const),
      }))

      setPages(pagesArray)
    } catch (error) {
      console.error('Error fetching pages:', error)
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchPages()
    }, 0)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get descendants of a page
  const getDescendants = (id: number, pagesArray: TreePage[]): Set<number> => {
    const descendants = new Set<number>()
    const visit = (pageId: number) => {
      const children = pagesArray.filter(p => p.parent === pageId)
      children.forEach(child => {
        descendants.add(child.id)
        visit(child.id)
      })
    }
    visit(id)
    return descendants
  }

  // Get current parent's full path for display
  const getCurrentParentPath = () => {
    if (!value) return 'None - top level page'
    const raw: unknown =
      typeof value === 'object' ? ((value as { id?: unknown; value?: unknown }).id ?? (value as { value?: unknown }).value) : value
    const numValue = Number(raw)
    if (!Number.isFinite(numValue) || numValue <= 0) return 'None - top level page'
    const parentPage = pages.find(p => p.id === numValue)
    if (!parentPage) return `Page #${numValue}`
    const path = pagePath(pages, numValue)
    return path ? `${parentPage.title}  ${path}` : parentPage.title
  }

  // Filter pages for search
  const filteredPages = React.useMemo(() => {
    if (!pages.length) return []

    const exclusions = new Set<number>()
    if (currentPageId) {
      exclusions.add(currentPageId)
      const descendants = getDescendants(currentPageId, pages)
      descendants.forEach(d => exclusions.add(d))
    }

    const searchLower = search.toLowerCase()
    const results: (TreePage & { path: string })[] = []

    for (const page of pages) {
      if (exclusions.has(page.id)) continue

      const path = pagePath(pages, page.id) || ''
      const title = page.title.toLowerCase()
      const slug = page.slug.toLowerCase()

      if (
        title.includes(searchLower) ||
        slug.includes(searchLower) ||
        path.toLowerCase().includes(searchLower)
      ) {
        results.push({ ...page, path })
      }

      if (results.length >= 50) break
    }

    return results
  }, [pages, search, currentPageId])

  const handleOpenModal = async () => {
    if (!readOnly) {
      setIsOpen(true)
      setHighlightedIndex(0)
      await fetchPages()
      // Focus search input on next render
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    setSearch('')
    setHighlightedIndex(0)
  }

  const handleSelectPage = (pageId: number | undefined) => {
    setValue(pageId)
    handleCloseModal()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseModal()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.min(prev + 1, filteredPages.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex === 0) {
        handleSelectPage(undefined)
      } else {
        const page = filteredPages[highlightedIndex - 1]
        if (page) handleSelectPage(page.id)
      }
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      handleCloseModal()
    }
  }

  return (
    <div className="field-type">
      <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />
      <div className="parent-picker__trigger-wrapper">
        <button
          type="button"
          id={`field-${path}`}
          className="parent-picker__trigger"
          onClick={handleOpenModal}
          disabled={readOnly}
        >
          {getCurrentParentPath()}
        </button>
        {value && (
          <button
            type="button"
            className="parent-picker__clear"
            onClick={() => setValue(undefined)}
            disabled={readOnly}
          >
            Clear
          </button>
        )}
      </div>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
        <div
          ref={overlayRef}
          className="parent-picker__overlay"
          onClick={handleOverlayClick}
        >
          <div className="parent-picker__dialog" role="dialog" aria-modal="true">
            <h2 className="parent-picker__title">Choose parent page</h2>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by page name or slug..."
              className="parent-picker__search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
            />
            <ul className="parent-picker__list">
              <li
                className={`parent-picker__row ${
                  highlightedIndex === 0 ? 'parent-picker__row--active' : ''
                }`}
                onClick={() => handleSelectPage(undefined)}
                onMouseEnter={() => setHighlightedIndex(0)}
              >
                <div className="parent-picker__row-content">
                  <div className="parent-picker__title">No parent (top level)</div>
                </div>
              </li>
              {filteredPages.map((page, idx) => {
                const isActive = highlightedIndex === idx + 1
                return (
                  <li
                    key={page.id}
                    className={`parent-picker__row ${
                      isActive ? 'parent-picker__row--active' : ''
                    }`}
                    onClick={() => handleSelectPage(page.id)}
                    onMouseEnter={() => setHighlightedIndex(idx + 1)}
                  >
                    <div className="parent-picker__row-content">
                      <div className="parent-picker__title">{page.title}</div>
                      <div className="parent-picker__path">{page.path}</div>
                      {page.status === 'draft' && (
                        <span className="parent-picker__badge">Draft</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>,
        document.body,
        )}
    </div>
  )
}