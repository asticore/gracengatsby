'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useEffect, useMemo, useState } from 'react'

import { FieldLabel, useDocumentInfo, useField, useFormFields } from '@/engine/ui'
import { readSpreadsheetFile, toCsv } from '@/lib/spreadsheet'

import { defaultChart, normalizeConfig, type StoredConfig } from '../config'
import { gridRows } from '../grid'
import {
  CELL_FORMATS,
  FILTER_OPERATORS,
  LIMITS,
  OPERATOR_LABELS,
  type ColumnSpec,
  type DataViewModel,
  type FilterRule,
  type ViewKind,
  type ViewSource,
} from '../types'
import type { FieldInfo } from '../catalogue'
import { DataViewView } from '../components/DataViewView'

import { EmbedCard } from './EmbedCard'
import { GridEditor } from './GridEditor'
import './dataViewEditor.css'

type CollectionInfo = { slug: string; label: string; hasCategory: boolean }
type Tab = 'data' | 'columns' | 'display'

const FORMAT_LABELS: Record<(typeof CELL_FORMATS)[number], string> = {
  auto: 'Automatic',
  text: 'Plain text',
  number: 'Number',
  currency: 'Currency',
  percent: 'Percent (25 shows 25%)',
  date: 'Date',
}

const CHART_KINDS: ViewKind[] = ['bar', 'line', 'area', 'pie', 'doughnut', 'scatter']

/** The editor for one table or chart: where the data comes from, which columns, how it looks, with a live preview and the embed links. */
export function DataViewEditorField({ path = 'config', readOnly }: { path?: string; readOnly?: boolean }) {
  const t = useAdminT()
  const { value, setValue } = useField<unknown>({ path })
  const { id } = useDocumentInfo()
  const { kindValue, sourceValue, titleValue, slugValue, publicValue } = useFormFields(([fields]) => ({
    kindValue: fields?.kind?.value,
    sourceValue: fields?.source?.value,
    titleValue: fields?.title?.value,
    slugValue: fields?.slug?.value,
    publicValue: fields?.isPublic?.value,
  }))

  const cfg = useMemo<StoredConfig>(() => normalizeConfig(value), [value])
  const kind = (typeof kindValue === 'string' ? kindValue : 'table') as ViewKind
  const source = (typeof sourceValue === 'string' ? sourceValue : 'custom-fields') as ViewSource
  const isChart = kind !== 'table'
  const update = (patch: Partial<StoredConfig>): void => setValue({ ...cfg, ...patch })

  const [tab, setTab] = useState<Tab>('data')
  const [catalogue, setCatalogue] = useState<{ collection: string; fields: FieldInfo[]; collections: CollectionInfo[] } | null>(null)
  const [preview, setPreview] = useState<{ model: DataViewModel | null; error: string | null; busy: boolean }>({ model: null, error: null, busy: true })

  // The pickers: collections and the fields a view may use from the chosen one.
  const collection = cfg.data.collection
  useEffect(() => {
    if (source !== 'custom-fields') return
    let cancelled = false
    fetch(`/api/admin-data-view-fields?collection=${encodeURIComponent(collection)}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ collections?: CollectionInfo[]; fields?: FieldInfo[] }>) : Promise.reject(new Error('failed'))))
      .then((json) => {
        if (!cancelled) setCatalogue({ collection, fields: json.fields ?? [], collections: json.collections ?? [] })
      })
      .catch(() => {
        if (!cancelled) setCatalogue({ collection, fields: [], collections: [] })
      })
    return () => {
      cancelled = true
    }
  }, [source, collection])

  const fields = catalogue && catalogue.collection === collection ? catalogue.fields : []
  const collections = catalogue?.collections ?? []

  // Live preview: the unsaved settings go to the same resolver the live site uses.
  const previewBody = JSON.stringify({ title: typeof titleValue === 'string' ? titleValue : '', kind, source, data: cfg.data, grid: cfg.grid, csvText: cfg.csvText, columns: cfg.columns, display: cfg.display, chart: cfg.chart })
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setPreview((current) => ({ ...current, busy: true }))
      fetch('/api/admin-data-view-preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: previewBody, signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ model?: DataViewModel }>) : Promise.reject(new Error(r.status === 403 ? 'You do not have permission to preview.' : 'The preview could not be built.'))))
        .then((json) => setPreview({ model: json.model ?? null, error: null, busy: false }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setPreview((current) => ({ ...current, error: error instanceof Error ? error.message : 'The preview could not be built.', busy: false }))
        })
    }, 450)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [previewBody])

  const previewColumns = preview.model?.data.columns ?? []

  // Columns available to pick, as { key, label, hint }.
  const gridHeaders = useMemo(() => (source === 'custom-fields' ? [] : gridRows({ source, csvText: cfg.csvText, grid: cfg.grid }).headers), [source, cfg.csvText, cfg.grid])
  const available: { key: string; label: string; hint?: string; format: ColumnSpec['format'] }[] =
    source === 'custom-fields'
      ? fields.map((f) => ({ key: f.key, label: f.label, hint: f.hint ? `Extra field, ${f.hint}` : undefined, format: f.defaultFormat }))
      : gridHeaders.map((h, i) => ({ key: `c${i}`, label: h.trim() || `Column ${i + 1}`, format: 'auto' as const }))

  return (
    <div className="dve">
      <FieldLabel label="Data and display" />

      <div className="dve-tabs" role="tablist" aria-label={t('al.dataViewSettings')}>
        {(['data', 'columns', 'display'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'dve-tab dve-tab--on' : 'dve-tab'} onClick={() => setTab(t)}>
            {t === 'data' ? 'Data' : t === 'columns' ? 'Columns' : isChart ? 'Chart' : 'Table'}
          </button>
        ))}
      </div>

      {tab === 'data' ? (
        <DataTab source={source} cfg={cfg} update={update} readOnly={readOnly} collections={collections} fields={fields} />
      ) : tab === 'columns' ? (
        <ColumnsTab cfg={cfg} update={update} readOnly={readOnly} available={available} source={source} />
      ) : isChart ? (
        <ChartTab cfg={cfg} update={update} readOnly={readOnly} kind={kind} columns={previewColumns.map((c) => ({ key: c.key, label: c.label, type: c.type }))} />
      ) : (
        <TableTab cfg={cfg} update={update} readOnly={readOnly} />
      )}

      <section className="dve-preview" aria-live="polite">
        <h3 className="dve-h">Live preview {preview.busy ? <span className="dve-help">updating...</span> : null}</h3>
        {preview.error ? <p className="dve-error">{preview.error}</p> : null}
        {preview.model ? (
          <div className="dv-preview-frame">
            <DataViewView model={preview.model} enhance={false} />
          </div>
        ) : preview.error ? null : (
          <p className="dve-help">Building the preview...</p>
        )}
        {preview.model?.data.truncated ? <p className="dve-help">The data was cut at the limit ({LIMITS.maxRows} rows, or the first {LIMITS.maxFetchedDocs} items read).</p> : null}
        {preview.model ? <p className="dve-help">{`Showing ${preview.model.data.rows.length} row${preview.model.data.rows.length === 1 ? '' : 's'} and ${preview.model.data.columns.length} column${preview.model.data.columns.length === 1 ? '' : 's'}. Sorting, search and paging work on the live page.`}</p> : null}
      </section>

      <EmbedCard id={id} slug={typeof slugValue === 'string' ? slugValue : ''} title={typeof titleValue === 'string' ? titleValue : ''} isPublic={publicValue === true} height={cfg.chart.height} />
    </div>
  )
}

type PanelProps = { cfg: StoredConfig; update: (patch: Partial<StoredConfig>) => void; readOnly?: boolean }

/* ----------------------------------------------------------------------------------------------- */
/* Data tab                                                                                         */
/* ----------------------------------------------------------------------------------------------- */

function DataTab({ source, cfg, update, readOnly, collections, fields }: PanelProps & { source: ViewSource; collections: CollectionInfo[]; fields: FieldInfo[] }) {
  const t = useAdminT()
  if (source === 'manual') return <GridEditor grid={cfg.grid} readOnly={readOnly} onChange={(grid) => update({ grid })} />
  if (source === 'csv') return <CsvImport cfg={cfg} update={update} readOnly={readOnly} />

  const data = cfg.data
  const info = collections.find((c) => c.slug === data.collection)
  const patchData = (patch: Partial<typeof data>): void => update({ data: { ...data, ...patch } })
  const patchFilter = (index: number, patch: Partial<FilterRule>): void => patchData({ filters: data.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)) })

  return (
    <div className="dve-panel">
      <label className="dve-field">
        <span>Where does the data come from?</span>
        <select value={data.collection} disabled={readOnly} onChange={(e) => update({ data: { ...data, collection: e.target.value, category: '', filters: [], sort: null }, columns: [] })}>
          {(collections.length ? collections : [{ slug: data.collection, label: data.collection, hasCategory: false }]).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="dve-help">Only published items are used. Members-only and password protected items are left out.</span>
      </label>

      {info?.hasCategory ? (
        <label className="dve-field">
          <span>Only this category (optional)</span>
          <input type="text" value={data.category} disabled={readOnly} onChange={(e) => patchData({ category: e.target.value })} placeholder="Leave blank for all" />
        </label>
      ) : null}

      <div className="dve-field">
        <span>Filters</span>
        {data.filters.length === 0 ? <span className="dve-help">No filters: every item is used.</span> : null}
        {data.filters.map((rule, i) => (
          <div key={i} className="dve-row">
            <select aria-label={t('al.field')} value={rule.field} disabled={readOnly} onChange={(e) => patchFilter(i, { field: e.target.value })}>
              {!fields.some((f) => f.key === rule.field) ? <option value={rule.field}>{rule.field} (not available)</option> : null}
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select aria-label={t('al.condition')} value={rule.operator} disabled={readOnly} onChange={(e) => patchFilter(i, { operator: e.target.value as FilterRule['operator'] })}>
              {FILTER_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            {rule.operator === 'isEmpty' || rule.operator === 'notEmpty' ? null : <input type="text" aria-label={t('al.value')} value={rule.value} disabled={readOnly} onChange={(e) => patchFilter(i, { value: e.target.value })} />}
            <button type="button" className="dve-btn" disabled={readOnly} onClick={() => patchData({ filters: data.filters.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="dve-btn" disabled={readOnly || data.filters.length >= LIMITS.maxFilters || fields.length === 0} onClick={() => patchData({ filters: [...data.filters, { field: fields[0]!.key, operator: 'equals', value: '' }] })}>
            Add a filter
          </button>
        </div>
      </div>

      <div className="dve-row">
        <label className="dve-field">
          <span>Sort by</span>
          <select value={data.sort?.key ?? ''} disabled={readOnly} onChange={(e) => patchData({ sort: e.target.value ? { key: e.target.value, direction: data.sort?.direction ?? 'asc' } : null })}>
            <option value="">Most relevant first</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dve-field">
          <span>Direction</span>
          <select value={data.sort?.direction ?? 'asc'} disabled={readOnly || !data.sort} onChange={(e) => data.sort && patchData({ sort: { ...data.sort, direction: e.target.value === 'desc' ? 'desc' : 'asc' } })}>
            <option value="asc">Lowest first (A to Z)</option>
            <option value="desc">Highest first (Z to A)</option>
          </select>
        </label>
        <label className="dve-field">
          <span>Most rows</span>
          <input type="number" min={1} max={LIMITS.maxRows} value={data.limit} disabled={readOnly} onChange={(e) => patchData({ limit: Math.min(LIMITS.maxRows, Math.max(1, Number(e.target.value) || 1)) })} />
          <span className="dve-help">Up to {LIMITS.maxRows}.</span>
        </label>
      </div>
    </div>
  )
}

function CsvImport({ cfg, update, readOnly }: PanelProps) {
  const [message, setMessage] = useState<string | null>(null)
  const rows = cfg.csvText ? gridRows({ source: 'csv', csvText: cfg.csvText, grid: cfg.grid }) : null

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await readSpreadsheetFile(file)
    if ('error' in result) {
      setMessage(result.error)
      return
    }
    const text = toCsv(result.rows.map((row) => row.map((cell) => String(cell ?? ''))))
    if (text.length > LIMITS.maxCsvChars) {
      setMessage('This file is too large to store in a view. Remove some rows or columns and import it again.')
      return
    }
    setMessage(result.truncated ? `Imported the first ${result.rows.length} rows (the file has more).` : `Imported ${result.rows.length} rows from ${file.name}.`)
    update({ csvText: text, columns: [] })
  }

  return (
    <div className="dve-panel">
      <label className="dve-field">
        <span>Choose a CSV, TSV or Excel (.xlsx) file</span>
        <input type="file" accept=".csv,.tsv,.txt,.xlsx" disabled={readOnly} onChange={onFile} />
        <span className="dve-help">The first row must hold the column headings. Files stay in your browser until you save; the data is then stored with this view, so re-import to refresh it.</span>
      </label>
      {message ? <p className="dve-help">{message}</p> : null}
      <label className="dve-field">
        <span>Or paste CSV text</span>
        <textarea rows={6} value={cfg.csvText} readOnly={readOnly} onChange={(e) => update({ csvText: e.target.value.slice(0, LIMITS.maxCsvChars) })} placeholder={'Month,Sales\nJan,120\nFeb,150'} />
      </label>
      {rows ? (
        <p className="dve-help">
          {rows.rows.length} data row{rows.rows.length === 1 ? '' : 's'}, {rows.headers.length} column{rows.headers.length === 1 ? '' : 's'}.
        </p>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------------------------------------- */
/* Columns tab                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

function ColumnsTab({ cfg, update, readOnly, available, source }: PanelProps & { available: { key: string; label: string; hint?: string; format: ColumnSpec['format'] }[]; source: ViewSource }) {
  const t = useAdminT()
  const columns = cfg.columns
  const setColumns = (next: ColumnSpec[]): void => update({ columns: next.slice(0, LIMITS.maxColumns) })
  const patch = (index: number, change: Partial<ColumnSpec>): void => setColumns(columns.map((c, i) => (i === index ? { ...c, ...change } : c)))
  const move = (index: number, by: number): void => {
    const target = index + by
    if (target < 0 || target >= columns.length) return
    const next = columns.slice()
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setColumns(next)
  }
  const spec = (key: string, format: ColumnSpec['format']): ColumnSpec => ({ key, label: '', format, decimals: -1, currency: 'AUD' })
  const unused = available.filter((a) => !columns.some((c) => c.key === a.key))
  const grid = source !== 'custom-fields'

  return (
    <div className="dve-panel">
      {grid && columns.length === 0 ? (
        <>
          <p className="dve-help">Every column of your data is shown. Customise to choose columns, rename them or set number, currency, percent and date formats.</p>
          <div>
            <button type="button" className="dve-btn" disabled={readOnly || available.length === 0} onClick={() => setColumns(available.map((a) => spec(a.key, a.format)))}>
              Customise columns
            </button>
          </div>
        </>
      ) : (
        <>
          {columns.length === 0 ? <p className="dve-help">Choose the columns to show. Names are the friendly labels from your content and Extra fields.</p> : null}
          {columns.map((column, i) => (
            <div key={column.key} className="dve-col">
              <div className="dve-col__name">
                <strong>{available.find((a) => a.key === column.key)?.label ?? column.key}</strong>
                {available.find((a) => a.key === column.key)?.hint ? <span className="dve-help">{available.find((a) => a.key === column.key)?.hint}</span> : null}
              </div>
              <label className="dve-field">
                <span>Heading shown</span>
                <input type="text" value={column.label} disabled={readOnly} placeholder="Same as the field name" onChange={(e) => patch(i, { label: e.target.value.slice(0, LIMITS.maxText) })} />
              </label>
              <label className="dve-field">
                <span>Format</span>
                <select value={column.format} disabled={readOnly} onChange={(e) => patch(i, { format: e.target.value as ColumnSpec['format'] })}>
                  {CELL_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_LABELS[f]}
                    </option>
                  ))}
                </select>
              </label>
              {column.format === 'number' || column.format === 'currency' || column.format === 'percent' ? (
                <label className="dve-field">
                  <span>Decimal places</span>
                  <input type="number" min={-1} max={6} value={column.decimals} disabled={readOnly} onChange={(e) => patch(i, { decimals: Math.max(-1, Math.min(6, Math.round(Number(e.target.value)))) })} title="-1 chooses automatically" />
                </label>
              ) : null}
              {column.format === 'currency' ? (
                <label className="dve-field">
                  <span>Currency code</span>
                  <input type="text" maxLength={3} value={column.currency} disabled={readOnly} onChange={(e) => patch(i, { currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} title="Three letters, for example AUD, USD, EUR" />
                </label>
              ) : null}
              <div className="dve-row">
                <button type="button" className="dve-btn" disabled={readOnly || i === 0} onClick={() => move(i, -1)} aria-label={t('list.moveUp')}>
                  Up
                </button>
                <button type="button" className="dve-btn" disabled={readOnly || i === columns.length - 1} onClick={() => move(i, 1)} aria-label={t('list.moveDown')}>
                  Down
                </button>
                <button type="button" className="dve-btn" disabled={readOnly} onClick={() => setColumns(columns.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <label className="dve-field">
            <span>Add a column</span>
            <select value="" disabled={readOnly || unused.length === 0 || columns.length >= LIMITS.maxColumns} onChange={(e) => e.target.value && setColumns([...columns, spec(e.target.value, available.find((a) => a.key === e.target.value)?.format ?? 'auto')])}>
              <option value="">{unused.length === 0 ? 'No more fields' : 'Choose a field...'}</option>
              {unused.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                  {a.hint ? ` (${a.hint})` : ''}
                </option>
              ))}
            </select>
          </label>
          {grid && columns.length > 0 ? (
            <div>
              <button type="button" className="dve-btn" disabled={readOnly} onClick={() => setColumns([])}>
                Show every column again
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------------------------------------- */
/* Table and chart option tabs                                                                      */
/* ----------------------------------------------------------------------------------------------- */

function Check({ label, checked, onChange, readOnly, help }: { label: string; checked: boolean; onChange: (value: boolean) => void; readOnly?: boolean; help?: string }) {
  return (
    <label className="dve-check" title={help}>
      <input type="checkbox" checked={checked} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
}

function TableTab({ cfg, update, readOnly }: PanelProps) {
  const d = cfg.display
  const set = (patch: Partial<typeof d>): void => update({ display: { ...d, ...patch } })
  return (
    <div className="dve-panel">
      <label className="dve-field">
        <span>Caption</span>
        <input type="text" value={d.caption} disabled={readOnly} onChange={(e) => set({ caption: e.target.value.slice(0, LIMITS.maxText) })} />
        <span className="dve-help">Shown above the table and read out by screen readers.</span>
      </label>
      <div className="dve-checks">
        <Check label="Show the heading row" checked={d.showHeader} readOnly={readOnly} onChange={(v) => set({ showHeader: v })} />
        <Check label="Repeat headings under the last row" checked={d.footerRow} readOnly={readOnly} onChange={(v) => set({ footerRow: v })} />
        <Check label="Shade every other row" checked={d.zebra} readOnly={readOnly} onChange={(v) => set({ zebra: v })} />
        <Check label="Keep the heading row visible while scrolling" checked={d.stickyHeader} readOnly={readOnly} onChange={(v) => set({ stickyHeader: v })} help="The table then scrolls inside a box up to 70% of the screen height." />
        <Check label="Visitors can click a heading to sort" checked={d.sortable} readOnly={readOnly} onChange={(v) => set({ sortable: v })} />
        <Check label="Add a search box" checked={d.searchable} readOnly={readOnly} onChange={(v) => set({ searchable: v })} />
        <Check label="Add a totals row for number columns" checked={d.totalsRow} readOnly={readOnly} onChange={(v) => set({ totalsRow: v })} />
      </div>
      {d.totalsRow ? (
        <label className="dve-field">
          <span>Totals row label</span>
          <input type="text" value={d.totalsLabel} disabled={readOnly} onChange={(e) => set({ totalsLabel: e.target.value.slice(0, 40) })} />
        </label>
      ) : null}
      <div className="dve-row">
        <label className="dve-field">
          <span>Rows per page</span>
          <input type="number" min={0} max={200} value={d.pageSize} disabled={readOnly} onChange={(e) => set({ pageSize: Math.max(0, Math.min(200, Math.round(Number(e.target.value)) || 0)) })} />
          <span className="dve-help">0 shows every row on one page.</span>
        </label>
        <label className="dve-field">
          <span>On small screens</span>
          <select value={d.responsive} disabled={readOnly} onChange={(e) => set({ responsive: e.target.value === 'stacked' ? 'stacked' : 'scroll' })}>
            <option value="scroll">Scroll sideways</option>
            <option value="stacked">Stack each row as a card</option>
          </select>
        </label>
      </div>
    </div>
  )
}

function ChartTab({ cfg, update, readOnly, kind, columns }: PanelProps & { kind: ViewKind; columns: { key: string; label: string; type: string }[] }) {
  const c = cfg.chart
  const set = (patch: Partial<typeof c>): void => update({ chart: { ...c, ...patch } })
  const numeric = columns.filter((col) => col.type === 'number')
  const pie = kind === 'pie' || kind === 'doughnut'
  const scatter = kind === 'scatter'
  const toggleY = (key: string, on: boolean): void => set({ y: on ? [...c.y, key].slice(0, LIMITS.maxSeries) : c.y.filter((k) => k !== key) })
  const defaults = defaultChart()

  return (
    <div className="dve-panel">
      <label className="dve-field">
        <span>Caption</span>
        <input type="text" value={cfg.display.caption} disabled={readOnly} onChange={(e) => update({ display: { ...cfg.display, caption: e.target.value.slice(0, LIMITS.maxText) } })} />
      </label>
      <div className="dve-row">
        <label className="dve-field">
          <span>{pie ? 'Slice names' : scatter ? 'Horizontal values (numbers)' : 'Labels along the bottom'}</span>
          <select value={c.x} disabled={readOnly} onChange={(e) => set({ x: e.target.value })}>
            <option value="">First column</option>
            {(scatter ? numeric : columns).map((col) => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
          </select>
        </label>
        {!scatter ? (
          <label className="dve-field">
            <span>Split into series by (optional)</span>
            <select value={c.seriesBy} disabled={readOnly} onChange={(e) => set({ seriesBy: e.target.value })}>
              <option value="">No split</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!scatter ? (
          <label className="dve-field">
            <span>Combine rows that share a label</span>
            <select value={c.aggregate} disabled={readOnly} onChange={(e) => set({ aggregate: e.target.value as typeof c.aggregate })}>
              <option value="none">No, one mark per row</option>
              <option value="sum">Add the values together</option>
              <option value="average">Average the values</option>
              <option value="count">Count the rows</option>
            </select>
          </label>
        ) : null}
      </div>

      {c.aggregate === 'count' && !scatter ? (
        <p className="dve-help">Counting rows needs no value column.</p>
      ) : (
        <fieldset className="dve-field">
          <legend>{pie ? 'Value column (the first one ticked is used)' : 'Value columns (numbers)'}</legend>
          {numeric.length === 0 ? <span className="dve-help">No number columns yet. Choose columns with numbers on the Columns tab.</span> : null}
          {numeric.map((col) => (
            <Check key={col.key} label={col.label} checked={c.y.includes(col.key)} readOnly={readOnly} onChange={(v) => toggleY(col.key, v)} />
          ))}
          <span className="dve-help">With none ticked, every number column is used.</span>
        </fieldset>
      )}

      {!pie ? (
        <div className="dve-row">
          <label className="dve-field">
            <span>Bottom axis title</span>
            <input type="text" value={c.xTitle} disabled={readOnly} onChange={(e) => set({ xTitle: e.target.value.slice(0, 80) })} />
          </label>
          <label className="dve-field">
            <span>Side axis title</span>
            <input type="text" value={c.yTitle} disabled={readOnly} onChange={(e) => set({ yTitle: e.target.value.slice(0, 80) })} />
          </label>
        </div>
      ) : null}

      <div className="dve-checks">
        <Check label="Show a legend" checked={c.legend} readOnly={readOnly} onChange={(v) => set({ legend: v })} />
        <Check label="Show values on the chart" checked={c.dataLabels} readOnly={readOnly} onChange={(v) => set({ dataLabels: v })} />
        {kind === 'bar' || kind === 'area' ? <Check label="Stack the series" checked={c.stacked} readOnly={readOnly} onChange={(v) => set({ stacked: v })} /> : null}
        {kind === 'line' || kind === 'area' ? <Check label="Smooth the lines" checked={c.smooth} readOnly={readOnly} onChange={(v) => set({ smooth: v })} /> : null}
      </div>
      <label className="dve-field">
        <span>Height (pixels)</span>
        <input type="number" min={LIMITS.minHeight} max={LIMITS.maxHeight} value={c.height} disabled={readOnly} onChange={(e) => set({ height: Math.max(LIMITS.minHeight, Math.min(LIMITS.maxHeight, Math.round(Number(e.target.value)) || defaults.height)) })} />
        <span className="dve-help">Colours come from your site theme.</span>
      </label>
    </div>
  )
}
