'use client'

import React, { useState } from 'react'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { CONFLICT_LABELS, CONFLICT_MODES, IMPORT_MAX_BYTES, PREVIEW_ROW_LIMIT, type ConflictMode } from '@/features/importContent/types'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import './import-content.css'

type PreviewRow = { ref: string; title: string; type: 'page' | 'post'; slug: string; status: 'published' | 'draft'; action: string; reason: string; conflict: boolean }
type Counts = { create: number; update: number; skip: number; error: number; pages: number; posts: number }
type PreviewReport = {
  format: 'wxr' | 'csv'
  counts: Counts
  skippedEntries: number
  totals: { imagesNotCopied: number; embedsRemoved: number; emptyPosts: number }
  rows: PreviewRow[]
  rowCount: number
  warnings: string[]
  errors: string[]
}
type ImportReport = {
  created: number
  updated: number
  skipped: number
  failed: number
  imagesNotCopied: number
  embedsRemoved: number
  warnings: string[]
  errors: Array<{ ref: string; title: string; message: string }>
  parseErrors: string[]
  parseWarnings: string[]
}
type ApiError = { error?: string; errors?: string[] }

const ACTION_WORDS: Record<string, string> = { create: 'Will be created', update: 'Will replace the draft', skip: 'Will be skipped', error: 'Cannot be imported' }

async function post(form: FormData): Promise<{ ok: boolean; data: unknown; message: string }> {
  try {
    const res = await fetch('/api/admin-import-content', { method: 'POST', body: form })
    const data = (await res.json().catch((): null => null)) as unknown
    if (res.ok) return { ok: true, data, message: '' }
    const problem = data as ApiError | null
    const message = [problem?.error, ...(problem?.errors ?? [])].filter(Boolean).join(' ') || 'The import could not run.'
    return { ok: false, data: null, message }
  } catch {
    return { ok: false, data: null, message: 'Network error. Nothing was imported.' }
  }
}

export function ImportContentClient() {
  const t = useAdminT()
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [conflicts, setConflicts] = useState<ConflictMode>('skip')
  const [keepPublished, setKeepPublished] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewReport | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)

  function changeInput(next: () => void) {
    next()
    setPreview(null)
    setResult(null)
    setError(null)
  }

  function buildForm(action: 'preview' | 'import'): FormData {
    const form = new FormData()
    if (file) form.append('file', file)
    else form.append('text', pasted)
    form.append('action', action)
    form.append('conflicts', conflicts)
    if (keepPublished) form.append('keepPublished', '1')
    return form
  }

  async function run(action: 'preview' | 'import') {
    if (!file && !pasted.trim()) {
      setError('Choose a file or paste some CSV text first.')
      return
    }
    if (file && file.size > IMPORT_MAX_BYTES) {
      setError('The file is larger than 6 MB. Split it into smaller files.')
      return
    }
    setBusy(action)
    setError(null)
    if (action === 'preview') setResult(null)
    const response = await post(buildForm(action))
    setBusy(null)
    if (!response.ok) {
      setError(response.message)
      return
    }
    if (action === 'preview') setPreview(response.data as PreviewReport)
    else {
      setResult(response.data as ImportReport)
      setPreview(null)
    }
  }

  const importable = preview ? preview.counts.create + preview.counts.update : 0

  return (
    <div className="ic-page">
      <header className="ic-header">
        <h1 className="ic-title">{t('importContent.title')}</h1>
        <p className="ic-muted">
          Bring content in from a WordPress export (.xml) or from a spreadsheet saved as CSV. Everything is saved as a draft unless you tick
          the option to keep published status. Nothing goes live by accident.
        </p>
      </header>

      <CollapsibleCard id="import-content-source" title="1. Choose your file">
        <div className="ic-field">
          <label className="ic-label" htmlFor="ic-file">
            File to import (.xml from WordPress, or .csv)
          </label>
          <input
            id="ic-file"
            type="file"
            accept=".xml,.csv,.tsv,.txt,text/xml,text/csv"
            onChange={(event) => changeInput(() => setFile(event.target.files?.[0] ?? null))}
          />
          <p className="ic-muted">{t('importContent.limit')}</p>
        </div>
        <div className="ic-field">
          <label className="ic-label" htmlFor="ic-paste">
            Or paste CSV text here (used only when no file is chosen)
          </label>
          <textarea
            id="ic-paste"
            className="ic-textarea"
            rows={6}
            value={pasted}
            onChange={(event) => changeInput(() => setPasted(event.target.value))}
            placeholder="title,slug,content,status,type"
          />
        </div>
        <div className="ic-help">
          <p className="ic-subheading">{t('importContent.csvHeading')}</p>
          <ul className="ic-list">
            <li>
              <strong>title</strong> is required. Other columns are optional.
            </li>
            <li>
              <strong>slug</strong> is the end of the web address. Leave it empty to make one from the title.
            </li>
            <li>
              <strong>content</strong> is the body. HTML is kept (links and headings); plain text becomes paragraphs.
            </li>
            <li>
              <strong>status</strong> is publish or draft. <strong>type</strong> is post or page (post if empty).
            </li>
            <li>
              <strong>date</strong> uses YYYY-MM-DD. <strong>parent_slug</strong> is for pages. <strong>categories</strong> is separated by |.
            </li>
          </ul>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="import-content-options" title="2. Choose what to do when an address is already used">
        <fieldset className="ic-fieldset">
          <legend className="ic-label">{t('importContent.urlInUse')}</legend>
          {CONFLICT_MODES.map((mode) => (
            <label key={mode} className="ic-radio">
              <input type="radio" name="ic-conflicts" value={mode} checked={conflicts === mode} onChange={() => changeInput(() => setConflicts(mode))} />
              <span>{CONFLICT_LABELS[mode]}</span>
            </label>
          ))}
        </fieldset>
        <label className="ic-checkbox">
          <input type="checkbox" checked={keepPublished} onChange={(event) => changeInput(() => setKeepPublished(event.target.checked))} />
          <span>{t('importContent.keepPublished')}</span>
        </label>
      </CollapsibleCard>

      <div className="ic-actions">
        <button type="button" className="ic-button ic-button--primary" onClick={() => run('preview')} disabled={busy !== null}>
          {busy === 'preview' ? 'Checking the file...' : 'Preview the import'}
        </button>
        <p className="ic-muted">{t('importContent.previewNote')}</p>
      </div>

      {error ? (
        <p className="ic-error" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <CollapsibleCard id="import-content-preview" title={`3. Preview: ${preview.counts.create} to create, ${preview.counts.update} to replace, ${preview.counts.skip} to skip`}>
          <p>
            {preview.counts.pages} page(s) and {preview.counts.posts} post(s) found in this {preview.format === 'wxr' ? 'WordPress export' : 'CSV file'}.
            {preview.skippedEntries ? ` ${preview.skippedEntries} entr${preview.skippedEntries === 1 ? 'y was' : 'ies were'} left out (attachments, menus, revisions or trashed items).` : ''}
          </p>
          {preview.totals.imagesNotCopied ? (
            <p className="ic-warning">
              {preview.totals.imagesNotCopied} image(s) were not copied. The imported text keeps their web addresses, which still point at the old site.
            </p>
          ) : null}
          {preview.totals.embedsRemoved ? <p className="ic-warning">{preview.totals.embedsRemoved} embedded item(s) such as videos or iframes were removed.</p> : null}
          {preview.totals.emptyPosts ? <p className="ic-warning">{preview.totals.emptyPosts} post(s) have no body text.</p> : null}
          {preview.warnings.map((line) => (
            <p key={line} className="ic-warning">
              {line}
            </p>
          ))}
          {preview.errors.length ? (
            <div className="ic-problems">
              <p className="ic-subheading">{t('importContent.problems')}</p>
              <ul className="ic-list">
                {preview.errors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="ic-table-wrap">
            <table className="ic-table">
              <thead>
                <tr>
                  <th>{t('importContent.colTitle')}</th>
                  <th>{t('importContent.colUrl')}</th>
                  <th>{t('importContent.colType')}</th>
                  <th>{t('importContent.colStatus')}</th>
                  <th>{t('importContent.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.ref}>
                    <td>{row.title}</td>
                    <td>{row.slug}</td>
                    <td>{row.type === 'page' ? 'Page' : 'Post'}</td>
                    <td>{row.status === 'published' ? 'Published' : 'Draft'}</td>
                    <td>
                      <span className={`ic-action ic-action--${row.action}`}>{ACTION_WORDS[row.action] ?? row.action}</span>
                      <span className="ic-muted"> {row.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rowCount > preview.rows.length ? <p className="ic-muted">{t('importContent.showingFirst', { limit: PREVIEW_ROW_LIMIT, count: preview.rowCount })}</p> : null}
          <div className="ic-actions">
            <button type="button" className="ic-button ic-button--primary" onClick={() => run('import')} disabled={busy !== null || importable === 0}>
              {busy === 'import' ? 'Importing... this can take a minute' : `Import ${importable} item(s)`}
            </button>
            <p className="ic-muted">{t('importContent.skipped')}</p>
          </div>
        </CollapsibleCard>
      ) : null}

      {result ? (
        <CollapsibleCard id="import-content-result" title={`4. Result: ${result.created} created, ${result.updated} replaced, ${result.failed} failed`}>
          <ul className="ic-list">
            <li>Created: {result.created}</li>
            <li>Replaced drafts: {result.updated}</li>
            <li>Skipped: {result.skipped}</li>
            <li>Failed: {result.failed}</li>
          </ul>
          {result.imagesNotCopied ? <p className="ic-warning">{result.imagesNotCopied} image(s) were not copied. Their web addresses still point at the old site.</p> : null}
          {result.embedsRemoved ? <p className="ic-warning">{result.embedsRemoved} embedded item(s) were removed.</p> : null}
          {[...result.parseWarnings, ...result.warnings].map((line) => (
            <p key={line} className="ic-warning">
              {line}
            </p>
          ))}
          {result.errors.length ? (
            <div className="ic-problems">
              <p className="ic-subheading">{t('importContent.failed')}</p>
              <ul className="ic-list">
                {result.errors.map((item) => (
                  <li key={`${item.ref}-${item.message}`}>
                    <strong>{item.title || item.ref}</strong>: {item.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CollapsibleCard>
      ) : null}
    </div>
  )
}

export default ImportContentClient
