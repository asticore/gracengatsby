'use client'

import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { autoMapColumns, buildImportRows, fieldsFromHeader, importableFields, sniffedToDef, templateCsv, unsupportedFields, type SniffedField, type SniffedType } from '@/features/customFields/spreadsheetImport'
import { readSpreadsheetFile, SPREADSHEET_MAX_DATA_ROWS } from '@/lib/spreadsheet'
import type { CustomFieldDef } from './types'
import './spreadsheet-import.css'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls'
const subscribeNoop = () => () => {}

/** Accessible modal: role=dialog, Escape closes, Tab stays inside, focus returns on close. */
export function SpreadsheetDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // false on the server and during hydration, true once mounted on the client.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)
  useEffect(() => {
    if (!mounted) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => previous?.focus?.()
  }, [mounted])
  if (!mounted) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="ssi-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="ssi-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <h3 id={titleId} className="ssi-title">
          {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body,
  )
}

type Loaded = { name: string; rows: string[][]; truncated: boolean }

/** File picker plus parse. Calls onLoaded with the rows, or shows the error. */
function FilePicker({ onLoaded }: { onLoaded: (loaded: Loaded | null) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useId()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontWeight: 600 }}>
        Choose a file
      </label>
      <input
        id={id}
        className="ssi-input"
        type="file"
        accept={ACCEPT}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          setError(null)
          onLoaded(null)
          if (!file) return
          setBusy(true)
          const result = await readSpreadsheetFile(file)
          setBusy(false)
          if ('error' in result) return setError(result.error)
          if (result.rows.length === 0) return setError('No rows were found in this file.')
          onLoaded({ name: file.name, rows: result.rows, truncated: result.truncated })
        }}
      />
      <p className="ssi-note">
        .csv, .tsv or .xlsx, up to 2 MB and {SPREADSHEET_MAX_DATA_ROWS.toLocaleString()} rows. Old .xls files are not supported: save them as .xlsx or .csv first. The file is read in your browser and is not uploaded.
      </p>
      {busy && <p className="ssi-note">Reading file...</p>}
      {error && (
        <p role="alert" className="ssi-error">
          {error}
        </p>
      )}
    </div>
  )
}

const colName = (i: number): string => {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function PreviewTable({ rows, header }: { rows: string[][]; header: string[] }) {
  const width = Math.max(header.length, ...rows.map((r) => r.length))
  const cols = Array.from({ length: width }, (_, i) => i)
  return (
    <div className="ssi-scroll" tabIndex={0} role="region" aria-label="Preview of the first rows">
      <table className="ssi-table">
        <thead>
          <tr>
            {cols.map((i) => (
              <th key={i} scope="col">
                {header[i] || colName(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((r, ri) => (
            <tr key={ri}>
              {cols.map((i) => (
                <td key={i}>{r[i] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Import from CSV or Excel" for a Repeating rows field. */
export function RepeaterImport({ def, rows, onApply }: { def: CustomFieldDef; rows: Record<string, unknown>[]; onApply: (next: Record<string, unknown>[]) => void }) {
  const fields = useMemo(() => importableFields(def), [def])
  const skippedTypes = useMemo(() => unsupportedFields(def), [def])
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  if (fields.length === 0) return null
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  return (
    <>
      <button ref={triggerRef} type="button" className="ssi-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Import from CSV or Excel
      </button>
      {open && <RepeaterImportDialog def={def} fields={fields} skippedTypes={skippedTypes} rows={rows} onApply={onApply} onClose={close} />}
    </>
  )
}

function RepeaterImportDialog({
  def,
  fields,
  skippedTypes,
  rows,
  onApply,
  onClose,
}: {
  def: CustomFieldDef
  fields: CustomFieldDef[]
  skippedTypes: CustomFieldDef[]
  rows: Record<string, unknown>[]
  onApply: (next: Record<string, unknown>[]) => void
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [mode, setMode] = useState<'replace' | 'add'>('replace')
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const max = def.max ?? Infinity

  const width = loaded ? Math.max(...loaded.rows.map((r) => r.length), 0) : 0
  const header = useMemo(() => (loaded ? (hasHeader ? loaded.rows[0] : Array.from({ length: width }, (_, i) => colName(i))) : []), [loaded, hasHeader, width])
  const data = useMemo(() => (loaded ? (hasHeader ? loaded.rows.slice(1) : loaded.rows) : []), [loaded, hasHeader])

  // Column mapping is reset whenever a file is loaded or the header checkbox changes.
  const mappingFor = (l: Loaded, withHeader: boolean): Record<string, number> => {
    const w = Math.max(...l.rows.map((r) => r.length), 0)
    return withHeader ? autoMapColumns(l.rows[0], fields) : Object.fromEntries(fields.map((f, i) => [f.name, i < w ? i : -1]))
  }

  const capacity = Math.max(0, max - (mode === 'add' ? rows.length : 0))
  const result = useMemo(() => (loaded ? buildImportRows(fields, mapping, data, { capacity }) : null), [loaded, fields, mapping, data, capacity])
  const mappedCount = Object.values(mapping).filter((v) => v >= 0).length
  const label = def.label || def.name

  const apply = () => {
    if (!result) return
    onApply(mode === 'add' ? [...rows, ...result.rows] : result.rows)
    onClose()
  }

  return (
    <SpreadsheetDialog title={`Import rows into ${label}`} onClose={onClose}>
      <FilePicker
        onLoaded={(l) => {
          setLoaded(l)
          if (l) setMapping(mappingFor(l, hasHeader))
        }}
      />
      {loaded && result && (
        <>
          {loaded.truncated && <p className="ssi-warn">Only the first {SPREADSHEET_MAX_DATA_ROWS.toLocaleString()} rows are read.</p>}
          <label className="ssi-check">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => {
                setHasHeader(e.target.checked)
                if (loaded) setMapping(mappingFor(loaded, e.target.checked))
              }}
            />
            First row contains column headings
          </label>
          <PreviewTable rows={data} header={header} />

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>Match columns to fields</legend>
            <div className="ssi-map">
              {fields.map((f) => (
                <React.Fragment key={f.name}>
                  <label htmlFor={`ssi-map-${f.name}`}>
                    {f.label || f.name} <span style={{ opacity: 0.6 }}>({f.type}{f.required ? ', required' : ''})</span>
                  </label>
                  <select
                    id={`ssi-map-${f.name}`}
                    className="ssi-select"
                    value={mapping[f.name] ?? -1}
                    onChange={(e) => setMapping({ ...mapping, [f.name]: Number(e.target.value) })}
                  >
                    <option value={-1}>Skip (leave empty)</option>
                    {Array.from({ length: width }, (_, i) => (
                      <option key={i} value={i}>
                        {colName(i)}: {header[i] || '(no heading)'}
                      </option>
                    ))}
                  </select>
                </React.Fragment>
              ))}
            </div>
            {skippedTypes.length > 0 && <p className="ssi-note">Not importable: {skippedTypes.map((f) => f.label || f.name).join(', ')}.</p>}
          </fieldset>

          <fieldset className="ssi-row" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>Existing rows ({rows.length})</legend>
            <label className="ssi-check">
              <input type="radio" name="ssi-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              Replace rows
            </label>
            <label className="ssi-check">
              <input type="radio" name="ssi-mode" checked={mode === 'add'} onChange={() => setMode('add')} />
              Add to existing rows
            </label>
          </fieldset>

          <div aria-live="polite">
            <p style={{ margin: 0 }}>
              <strong>{result.rows.length}</strong> row{result.rows.length === 1 ? '' : 's'} will be {mode === 'add' ? 'added' : 'imported'}
              {result.skipped.length > 0 && (
                <>
                  , <strong>{result.skipped.length}</strong> skipped
                </>
              )}
              {Number.isFinite(max) && <> (maximum {max} rows)</>}.
            </p>
            {mappedCount === 0 && <p className="ssi-warn">No columns are matched yet. Choose a column for at least one field.</p>}
            {result.skipped.length > 0 && (
              <ul className="ssi-skipped" aria-label="Skipped rows">
                {result.skipped.slice(0, 20).map((s) => (
                  <li key={s.line}>
                    Line {s.line}: {s.reason}
                  </li>
                ))}
                {result.skipped.length > 20 && <li>and {result.skipped.length - 20} more.</li>}
              </ul>
            )}
          </div>
        </>
      )}
      <div className="ssi-actions">
        <button type="button" className="ssi-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="ssi-btn ssi-btn--primary" disabled={!result || result.rows.length === 0} onClick={apply}>
          {mode === 'add' ? 'Add rows' : 'Replace rows'}
        </button>
      </div>
    </SpreadsheetDialog>
  )
}

/** Link that downloads a CSV with the sub field names as headers. */
export function TemplateLink({ def }: { def: CustomFieldDef }) {
  if (importableFields(def).length === 0) return null
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + templateCsv(def))}`
  return (
    <a className="ssi-link" href={href} download={`${def.name || 'rows'}-template.csv`}>
      Download a CSV template
    </a>
  )
}

const FIELD_TYPE_LABELS: Record<SniffedType, string> = { text: 'Text', textarea: 'Text area', number: 'Number', date: 'Date', checkbox: 'Checkbox' }

export type HeaderTarget = { kind: 'fields' } | { kind: 'repeater'; index: number } | { kind: 'new-repeater'; label: string }

/** "Create fields from a CSV or Excel header row" in the set builder. */
export function HeaderFieldsImport({
  existingNames,
  repeaters,
  onAdd,
}: {
  existingNames: (target: HeaderTarget) => string[]
  repeaters: { index: number; label: string }[]
  onAdd: (target: HeaderTarget, defs: CustomFieldDef[]) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  return (
    <>
      <button ref={triggerRef} type="button" className="ssi-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Create fields from a CSV or Excel header row
      </button>
      {open && <HeaderDialog existingNames={existingNames} repeaters={repeaters} onAdd={onAdd} onClose={close} />}
    </>
  )
}

function HeaderDialog({
  existingNames,
  repeaters,
  onAdd,
  onClose,
}: {
  existingNames: (target: HeaderTarget) => string[]
  repeaters: { index: number; label: string }[]
  onAdd: (target: HeaderTarget, defs: CustomFieldDef[]) => void
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [targetKey, setTargetKey] = useState('fields')
  const [tableLabel, setTableLabel] = useState('Table')
  const [edits, setEdits] = useState<Record<number, { skip?: boolean; type?: SniffedType; label?: string }>>({})

  const target: HeaderTarget = targetKey === 'fields' ? { kind: 'fields' } : targetKey === 'new' ? { kind: 'new-repeater', label: tableLabel } : { kind: 'repeater', index: Number(targetKey.slice(2)) }
  const taken = existingNames(target)
  const takenKey = taken.join('|')
  const sniffed = useMemo(() => (loaded ? fieldsFromHeader(loaded.rows, taken) : []), [loaded, takenKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const final = useMemo(() => {
    const kept: SniffedField[] = []
    sniffed.forEach((f, i) => {
      const e = edits[i]
      if (e?.skip) return
      kept.push({ ...f, label: e?.label ?? f.label, type: e?.type ?? f.type })
    })
    return kept
  }, [sniffed, edits])

  const apply = () => {
    onAdd(target, final.map(sniffedToDef))
    onClose()
  }

  return (
    <SpreadsheetDialog title="Create fields from a header row" onClose={onClose}>
      <FilePicker
        onLoaded={(l) => {
          setLoaded(l)
          setEdits({})
        }}
      />
      {loaded && (
        <>
          <p className="ssi-note">
            Field names come from the first row. Types are guessed from the next 20 rows. Check them, then add.
          </p>
          <div className="ssi-row">
            <label htmlFor="ssi-target" style={{ fontWeight: 600 }}>
              Add them as
            </label>
            <select id="ssi-target" className="ssi-select" style={{ width: 'auto' }} value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
              <option value="fields">Fields of this set</option>
              <option value="new">Columns of a new Repeating rows field</option>
              {repeaters.map((r) => (
                <option key={r.index} value={`r:${r.index}`}>
                  Columns of &quot;{r.label}&quot;
                </option>
              ))}
            </select>
            {targetKey === 'new' && (
              <input className="ssi-input" style={{ width: 200 }} aria-label="Name of the new Repeating rows field" value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} />
            )}
          </div>
          <div className="ssi-scroll">
            <table className="ssi-table">
              <thead>
                <tr>
                  <th scope="col">Add</th>
                  <th scope="col">Label</th>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                </tr>
              </thead>
              <tbody>
                {sniffed.map((f, i) => {
                  const e = edits[i] ?? {}
                  return (
                    <tr key={i}>
                      <td>
                        <input type="checkbox" aria-label={`Add ${f.label}`} checked={!e.skip} onChange={(ev) => setEdits({ ...edits, [i]: { ...e, skip: !ev.target.checked } })} />
                      </td>
                      <td>
                        <input className="ssi-input" aria-label={`Label for ${f.label}`} value={e.label ?? f.label} onChange={(ev) => setEdits({ ...edits, [i]: { ...e, label: ev.target.value } })} />
                      </td>
                      <td>
                        <code>{f.name}</code>
                      </td>
                      <td>
                        <select className="ssi-select" aria-label={`Type for ${f.label}`} value={e.type ?? f.type} onChange={(ev) => setEdits({ ...edits, [i]: { ...e, type: ev.target.value as SniffedType } })}>
                          {(Object.keys(FIELD_TYPE_LABELS) as SniffedType[]).map((t) => (
                            <option key={t} value={t}>
                              {FIELD_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sniffed.length === 0 && <p className="ssi-warn">The first row has no headings.</p>}
        </>
      )}
      <div className="ssi-actions">
        <button type="button" className="ssi-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="ssi-btn ssi-btn--primary" disabled={final.length === 0} onClick={apply}>
          Add {final.length} field{final.length === 1 ? '' : 's'}
        </button>
      </div>
    </SpreadsheetDialog>
  )
}
