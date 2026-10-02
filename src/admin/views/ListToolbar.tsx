'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import type { ListState, ColumnDef, ListFilter } from '@/admin/list/listQuery'
import { serializeListState } from '@/admin/list/listQuery'

interface ListToolbarProps {
  collectionSlug: string
  state: ListState
  columns: ColumnDef[]
  visibleNames: string[]
  limit: number
  hasSavedPrefs: boolean
  totalDocs: number
  view: string
}

export function ListToolbar({
  collectionSlug,
  state,
  columns,
  visibleNames,
  limit,
  hasSavedPrefs,
  totalDocs,
  view,
}: ListToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showFilterBuilder, setShowFilterBuilder] = useState(false)
  const [tempFilters, setTempFilters] = useState<ListFilter[]>(state.filters)
  const columnPickerRef = useRef<HTMLDivElement>(null)
  const filterBuilderRef = useRef<HTMLDivElement>(null)

  // Get filterable columns
  const filterableColumns = columns.filter((c) => c.filterable)

  // Close pickers on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false)
      }
      if (filterBuilderRef.current && !filterBuilderRef.current.contains(e.target as Node)) {
        setShowFilterBuilder(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const q = formData.get('q') as string
    const newState = { ...state, q: q || undefined, page: 1 }
    router.push(`${pathname}?${serializeListState(newState)}`)
  }

  const handleColumnToggle = (colName: string) => {
    const newCols = visibleNames.includes(colName)
      ? visibleNames.filter((c) => c !== colName)
      : [...visibleNames, colName]
    const newState = { ...state, cols: newCols, page: 1 }
    router.push(`${pathname}?${serializeListState(newState)}`)
  }

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLimit = Number(e.target.value)
    const newState = { ...state, limit: newLimit, page: 1 }
    router.push(`${pathname}?${serializeListState(newState)}`)
  }

  const handleSavePrefs = async () => {
    setIsSaving(true)
    try {
      const resp = await fetch('/api/admin-list-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: collectionSlug,
          prefs: {
            cols: visibleNames,
            sort: state.sort,
            limit: state.limit,
            view,
          },
        }),
      })
      if (resp.ok) {
        // Optionally show a toast or similar
      }
    } catch {
      console.error('Failed to save preferences')
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetPrefs = async () => {
    setIsSaving(true)
    try {
      await fetch(`/api/admin-list-prefs?collection=${collectionSlug}`, {
        method: 'DELETE',
      })
      router.push(`/admin/collections/${collectionSlug}`)
      router.refresh()
    } catch {
      console.error('Failed to reset preferences')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddFilter = () => {
    setTempFilters([
      ...tempFilters,
      { field: filterableColumns[0]?.name || '', op: 'equals', value: '' },
    ])
  }

  const handleRemoveFilter = (index: number) => {
    setTempFilters(tempFilters.filter((_, i) => i !== index))
  }

  const handleFilterChange = (index: number, key: 'field' | 'op' | 'value', val: string) => {
    const updated = [...tempFilters]
    updated[index] = { ...updated[index], [key]: val }
    setTempFilters(updated)
  }

  const handleApplyFilters = () => {
    const newState = { ...state, filters: tempFilters, page: 1 }
    router.push(`${pathname}?${serializeListState(newState)}`)
    setShowFilterBuilder(false)
  }

  const handleRemoveActiveFilter = (index: number) => {
    const newFilters = state.filters.filter((_, i) => i !== index)
    const newState = { ...state, filters: newFilters, page: 1 }
    router.push(`${pathname}?${serializeListState(newState)}`)
  }

  return (
    <div className="list-toolbar">
      {/* Search box */}
      <form onSubmit={handleSearch} className="list-search-form">
        <input
          type="text"
          name="q"
          placeholder="Search..."
          defaultValue={state.q || ''}
          className="list-search-input"
        />
        <button type="submit" className="list-search-btn">
          Search
        </button>
      </form>

      {/* Page size selector */}
      <select value={limit} onChange={handleLimitChange} className="list-limit-select">
        <option value="10">10 per page</option>
        <option value="25">25 per page</option>
        <option value="50">50 per page</option>
        <option value="100">100 per page</option>
      </select>

      {/* Filter builder dropdown */}
      {filterableColumns.length > 0 && (
        <div className="list-filter-builder" ref={filterBuilderRef}>
          <button
            onClick={() => setShowFilterBuilder(!showFilterBuilder)}
            className="list-column-picker-btn"
          >
            Filter
            {state.filters.length > 0 && <span className="list-filter-badge">{state.filters.length}</span>}
          </button>
          {showFilterBuilder && (
            <div className="list-filter-builder-menu">
              {tempFilters.map((filter, idx) => (
                <div key={idx} className="list-filter-row">
                  <select
                    value={filter.field}
                    onChange={(e) => handleFilterChange(idx, 'field', e.target.value)}
                    className="list-filter-field-select"
                  >
                    {filterableColumns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filter.op}
                    onChange={(e) => handleFilterChange(idx, 'op', e.target.value)}
                    className="list-filter-op-select"
                  >
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                    <option value="contains">contains</option>
                    <option value="greater_than">greater than</option>
                    <option value="less_than">less than</option>
                    <option value="exists">exists</option>
                  </select>
                  <input
                    type="text"
                    value={filter.value}
                    onChange={(e) => handleFilterChange(idx, 'value', e.target.value)}
                    placeholder="value"
                    className="list-filter-value-input"
                  />
                  <button
                    onClick={() => handleRemoveFilter(idx)}
                    className="list-filter-remove-btn"
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="list-filter-actions">
                <button
                  onClick={handleAddFilter}
                  className="list-filter-add-btn"
                  type="button"
                >
                  Add Filter
                </button>
                <button
                  onClick={handleApplyFilters}
                  className="list-filter-apply-btn"
                  type="button"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Column picker dropdown */}
      <div className="list-column-picker" ref={columnPickerRef}>
        <button
          onClick={() => setShowColumnPicker(!showColumnPicker)}
          className="list-column-picker-btn"
        >
          Columns
        </button>
        {showColumnPicker && (
          <div className="list-column-picker-menu">
            {columns.map((col) => (
              <label key={col.name} className="list-column-checkbox">
                <input
                  type="checkbox"
                  checked={visibleNames.includes(col.name)}
                  onChange={() => handleColumnToggle(col.name)}
                />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Save/Reset preferences buttons */}
      <button
        onClick={handleSavePrefs}
        disabled={isSaving}
        className="list-toolbar-btn"
        title="Save current columns, sort, and page size as your default"
      >
        {isSaving ? 'Saving...' : 'Save as default'}
      </button>
      {hasSavedPrefs && (
        <button
          onClick={handleResetPrefs}
          disabled={isSaving}
          className="list-toolbar-btn"
          title="Reset to collection defaults"
        >
          {isSaving ? 'Resetting...' : 'Reset to default'}
        </button>
      )}
    </div>
  )
}
