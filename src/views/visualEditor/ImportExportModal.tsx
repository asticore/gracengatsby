'use client'

import React, { useEffect, useMemo, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { exportPage, IMPORT_LIMITS, parsePageImport, slugifyFileName, writeClipboard, type ImportParseResult } from './editorClipboard'

/**
 * Import / Export dialog for the visual editor top bar. Export copies or downloads the whole page as
 * one engage-template document. Import validates a JSON file or pasted text, then appends it or
 * replaces the page through the editor's own callbacks (so undo/redo and lock checks apply).
 */

type Tab = 'export' | 'import'

export type ImportExportModalProps = {
  blocks: SectionNode[]
  title: string
  onClose: () => void
  /** Returns false when the editor refused the change (for example a locked part of the page). */
  onAppend: (nodes: SectionNode[]) => boolean
  onReplace: (nodes: SectionNode[]) => boolean
}

function downloadText(text: string, fileName: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const formatSize = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)

const ExportPanel: React.FC<{ blocks: SectionNode[]; title: string }> = ({ blocks, title }) => {
  const exported = useMemo(() => exportPage(blocks), [blocks])
  const bytes = useMemo(() => new Blob([exported.text]).size, [exported.text])
  const [note, setNote] = useState<string | null>(null)
  const fileName = `${slugifyFileName(title)}.json`

  return (
    <div className="ve-ie__panel">
      <p className="ve-ie__hint">
        The whole page as one engage-template file, with editor-only ids left out. Load it on this page or another one from the Import
        tab. Copy puts the text on the clipboard; Download saves a .json file.
      </p>
      <dl className="ve-ie__summary">
        <dt>Size</dt>
        <dd>{formatSize(bytes)}</dd>
        <dt>Blocks</dt>
        <dd>
          {exported.count} (including nested blocks), {exported.sections} top-level sections
        </dd>
      </dl>
      <div className="ve-ie__actions">
        <button
          type="button"
          className="ve-btn ve-btn--primary"
          onClick={async () => {
            const where = await writeClipboard(exported.text)
            setNote(
              where === 'system'
                ? 'Copied. Paste it into the Import tab, or use Download.'
                : 'The browser blocked the clipboard, so this copy only works inside this editor. Download the file to keep it.',
            )
          }}
        >
          Copy page JSON
        </button>
        <button type="button" className="ve-btn" onClick={() => downloadText(exported.text, fileName)}>
          Download .json
        </button>
        <button
          type="button"
          className="ve-btn"
          onClick={async () => {
            try {
              const { treeToStaticHtml } = await import('@/features/templateRepos/exportHtml')
              const result = treeToStaticHtml(blocks, { title, baseUrl: window.location.origin })
              downloadText(result.html, `${slugifyFileName(title)}.html`, 'text/html')
              setNote(
                `Saved as HTML. ${result.note}` +
                  (result.skipped.length > 0 ? ` Left out (marked in the file): ${Array.from(new Set(result.skipped)).join('; ')}.` : ''),
              )
            } catch {
              setNote('The HTML file could not be made.')
            }
          }}
        >
          Download HTML
        </button>
      </div>
      <p className="ve-ie__note" role="status">
        {note ?? `File name: ${fileName}`}
      </p>
    </div>
  )
}

const ImportPanel: React.FC<{
  onAppend: (nodes: SectionNode[]) => boolean
  onReplace: (nodes: SectionNode[]) => boolean
  onClose: () => void
}> = ({ onAppend, onReplace, onClose }) => {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportParseResult | null>(null)
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [confirmed, setConfirmed] = useState(false)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileName(file.name)
    setConfirmed(false)
    if (file.size > IMPORT_LIMITS.maxChars) {
      setText('')
      setResult({ ok: false, error: 'The file is too large to import (the limit is 5 MB).' })
      return
    }
    const body = await file.text()
    setText(body)
    setResult(parsePageImport(body))
  }

  const handleImport = () => {
    if (!result || !result.ok) return
    const nodes = result.summary.nodes
    const done = mode === 'append' ? onAppend(nodes) : onReplace(nodes)
    if (done) onClose()
  }

  const canImport = result?.ok === true && (mode === 'append' || confirmed)
  const summary = result?.ok === true ? result.summary : null

  return (
    <div className="ve-ie__panel">
      <label className="ve-ie__field">
        <span>JSON file</span>
        <input type="file" accept=".json,application/json" onChange={handleFile} />
      </label>
      <label className="ve-ie__field">
        <span>Or paste the JSON</span>
        <textarea
          className="ve-ie__textarea"
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value)
            setFileName(null)
            setResult(null)
            setConfirmed(false)
          }}
          placeholder='{"format":"engage-template", ...}'
        />
      </label>
      <div className="ve-ie__actions">
        <button type="button" className="ve-btn" onClick={() => setResult(parsePageImport(text))} disabled={!text.trim()}>
          Validate
        </button>
        {fileName && <span className="ve-ie__note">Loaded {fileName}</span>}
      </div>

      {result?.ok === false && (
        <p className="ve-error" role="alert">
          {result.error}
        </p>
      )}

      {summary && (
        <div className="ve-ie__summary-box">
          <dl className="ve-ie__summary">
            <dt>Kind</dt>
            <dd>{summary.kind}</dd>
            <dt>Schema version</dt>
            <dd>{summary.schemaVersion}</dd>
            <dt>Sections</dt>
            <dd>{summary.sections}</dd>
            <dt>Blocks (incl. nested)</dt>
            <dd>{summary.elementCount}</dd>
          </dl>
          {summary.unknownTypes.length > 0 && (
            <div className="ve-ie__warn" role="status">
              <strong>
                {summary.unknownTypes.length} unknown {summary.unknownTypes.length === 1 ? 'type' : 'types'} kept.
              </strong>{' '}
              This editor does not know these, so they may not show or edit properly:
              <ul>
                {summary.unknownTypes.map((type) => (
                  <li key={type}>
                    <code>{type}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <fieldset className="ve-ie__modes">
        <legend>How to import</legend>
        <label>
          <input type="radio" name="ve-ie-mode" checked={mode === 'append'} onChange={() => setMode('append')} /> Append to page
        </label>
        <label>
          <input
            type="radio"
            name="ve-ie-mode"
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
          />{' '}
          Replace page
        </label>
      </fieldset>
      {mode === 'replace' && (
        <label className="ve-ie__confirm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I understand this replaces
          the current content
        </label>
      )}

      <div className="ve-ie__actions">
        <button type="button" className="ve-btn ve-btn--primary" disabled={!canImport} onClick={handleImport}>
          Import
        </button>
      </div>
      <p className="ve-ie__hint">Imported blocks get fresh ids. Undo reverses an import.</p>
    </div>
  )
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({ blocks, title, onClose, onAppend, onReplace }) => {
  const [tab, setTab] = useState<Tab>('export')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ve-modal-overlay" role="presentation" onClick={onClose}>
      <div className="ve-modal ve-ie" role="dialog" aria-modal="true" aria-labelledby="ve-ie-title" onClick={(event) => event.stopPropagation()}>
        <div className="ve-modal__header">
          <h2 id="ve-ie-title" className="ve-ie__title">
            Import / Export
          </h2>
          <button type="button" className="ve-btn ve-btn--ghost" aria-label="Close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="ve-modal__body">
          <div className="ve-ie__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'export'}
              className={`ve-btn ve-btn--ghost ${tab === 'export' ? 've-ie__tab--active' : ''}`}
              onClick={() => setTab('export')}
            >
              Export
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'import'}
              className={`ve-btn ve-btn--ghost ${tab === 'import' ? 've-ie__tab--active' : ''}`}
              onClick={() => setTab('import')}
            >
              Import
            </button>
          </div>
          {tab === 'export' ? (
            <ExportPanel blocks={blocks} title={title} />
          ) : (
            <ImportPanel onAppend={onAppend} onReplace={onReplace} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}
