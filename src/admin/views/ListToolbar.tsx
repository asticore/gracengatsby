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
  const [saveError, setSaveError] = useState<string | null>(null)
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

  const handleColumnReorder = (fromIdx: number, toIdx: number) => {
    const newCols = [...visibleNames]
    const [removed] = newCols.splice(fromIdx, 1)
    newCols.splice(toIdx, 0, removed)
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
        setSaveError(null)
        router.refresh()
      } else {
        setSaveError('Could not save your defaults')
      }
    } catch {
      setSaveError('Could not save your defaults')
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
    // Drop rows with no value (an empty "equals" would match nothing); 'exists' needs no typed value
    const filters = tempFilters
      .map((f) => (f.op === 'exists' && !f.value ? { ...f, value: 'true' } : f))
      .filter((f) => f.value !== '')
    const newState = { ...state, filters, page: 1 }
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
            {columns.map((col, idx) => {
              const isVisible = visibleNames.includes(col.name)
              const visibleIdx = visibleNames.indexOf(col.name)
              return (
                <div key={col.name} className="list-column-picker-row">
                  <label className="list-column-checkbox">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => handleColumnToggle(col.name)}
                    />
                    {col.label}
                  </label>
                  {isVisible && visibleIdx > 0 && (
                    <button
                      onClick={() => handleColumnReorder(visibleIdx, visibleIdx - 1)}
                      className="list-column-up-btn"
                      title="Move up"
                      type="button"
                    >
                      ↑
                    </button>
                  )}
                  {isVisible && visibleIdx < visibleNames.length - 1 && (
                    <button
                      onClick={() => handleColumnReorder(visibleIdx, visibleIdx + 1)}
                      className="list-column-down-btn"
                      title="Move down"
                      type="button"
                    >
                      ↓
                    </button>
                  )}
                </div>
              )
            })}
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
      {saveError && (
        <span role="alert" className="list-toolbar-error">
          {saveError}
        </span>
      )}
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

      {/* Collection-specific actions */}
      {collectionSlug === 'redirects' && (
        <RedirectsToolbarActions />
      )}
    </div>
  )
}

/**
 * Redirects-specific toolbar actions: CSV export/import and URL testing
 */
function RedirectsToolbarActions() {
  const [showImport, setShowImport] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [testUrl, setTestUrl] = useState('')
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const importRef = useRef<HTMLDivElement>(null)
  const testRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close modals on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (importRef.current && !importRef.current.contains(e.target as Node)) {
        setShowImport(false)
      }
      if (testRef.current && !testRef.current.contains(e.target as Node)) {
        setShowTest(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExportCsv = async () => {
    try {
      const response = await fetch('/api/admin-redirects-csv')
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `redirects-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      alert('Failed to export CSV')
    }
  }

  const handleImportSubmit = async (confirm?: boolean) => {
    if (!importFile) return

    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)

      const queryString = confirm ? '' : '?dryRun=1'
      const response = await fetch(`/api/admin-redirects-csv${queryString}`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Import failed')
      const result = (await response.json()) as Record<string, unknown>
      setImportResult(result)

      // If confirmed (not dry-run), refresh the list
      if (confirm && result.success) {
        setTimeout(() => {
          router.refresh()
          setShowImport(false)
          setImportFile(null)
          setImportResult(null)
        }, 500)
      }
    } catch (_error) {
      alert('Failed to import CSV')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestUrl = async () => {
    if (!testUrl.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin-redirects-test?path=${encodeURIComponent(testUrl)}`)
      if (!response.ok) throw new Error('Test failed')
      const result = (await response.json()) as Record<string, unknown>
      setTestResult(result)
    } catch (_error) {
      alert('Failed to test URL')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button onClick={handleExportCsv} className="list-toolbar-btn" title="Export redirects to CSV">
        Export CSV
      </button>

      <div className="list-import-modal" ref={importRef}>
        <button
          onClick={() => {
            setShowImport(!showImport)
            setImportResult(null)
          }}
          className="list-toolbar-btn"
          title="Import redirects from CSV"
        >
          Import CSV
        </button>
        {showImport && (
          <div className="list-import-panel">
            {!importResult ? (
              <>
                <label className="list-import-label">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      setImportFile(e.target.files?.[0] || null)
                    }}
                    className="list-import-input"
                  />
                  Choose CSV file
                </label>
                <button
                  onClick={() => handleImportSubmit(false)}
                  disabled={!importFile || isLoading}
                  className="list-import-btn"
                >
                  {isLoading ? 'Loading...' : 'Preview'}
                </button>
              </>
            ) : (
              <div className="list-import-result">
                <p>
                  Valid: {String((importResult as Record<string, unknown>).validRows)} | Errors:{' '}
                  {String((importResult as Record<string, unknown>).errorRows)}
                </p>
                {((importResult as Record<string, unknown>).errors as Array<{ line: number; message: string }> | undefined)?.length > 0 && (
                  <ul className="list-import-errors">
                    {((importResult as Record<string, unknown>).errors as Array<{ line: number; message: string }> | undefined)?.slice(0, 3).map((e, i) => (
                      <li key={i}>
                        Line {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => handleImportSubmit(true)}
                  disabled={isLoading || ((importResult as Record<string, unknown>).validRows as number) === 0}
                  className="list-import-btn list-import-btn--confirm"
                >
                  {isLoading ? 'Importing...' : `Import ${String((importResult as Record<string, unknown>).validRows)}`}
                </button>
                <button
                  onClick={() => {
                    setImportResult(null)
                    setImportFile(null)
                  }}
                  className="list-import-btn"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="list-test-modal" ref={testRef}>
        <button
          onClick={() => {
            setShowTest(!showTest)
            setTestResult(null)
          }}
          className="list-toolbar-btn"
          title="Test a redirect URL"
        >
          Test URL
        </button>
        {showTest && (
          <div className="list-test-panel">
            <input
              type="text"
              placeholder="/old-path"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className="list-test-input"
            />
            <button
              onClick={handleTestUrl}
              disabled={!testUrl.trim() || isLoading}
              className="list-test-btn"
            >
              {isLoading ? 'Testing...' : 'Test'}
            </button>
            {testResult && (
              <div className="list-test-result">
                {(testResult as Record<string, unknown>).match ? (
                  <>
                    <p>
                      <strong>Redirects to:</strong> {String((testResult as Record<string, unknown>).toPath)}
                    </p>
                    <p>
                      <strong>Type:</strong> {String((testResult as Record<string, unknown>).redirectType)}
                    </p>
                    {((testResult as Record<string, unknown>).chainLength as number) > 1 && (
                      <p>
                        <strong>Chain length:</strong> {String((testResult as Record<string, unknown>).chainLength)}
                      </p>
                    )}
                  </>
                ) : (
                  <p>No redirect found</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
