'use client'

import React, { useEffect, useRef, useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { ALLOWED_WEIGHTS, fontStack, mergeInstalledFont, removeInstalledFont, sanitizeInstalledFonts } from '@/features/fonts/installed'
import type { CatalogFont, InstalledFont } from '@/features/fonts/types'
import { loadFontInAdmin } from './fontLoader'
import './fonts-manager.css'

type FontsManagerFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

type SourceFilter = 'all' | 'google' | 'other'

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All sources',
  google: 'Google Fonts only',
  other: 'Fontsource only',
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DELAY_MS = 300
const SAMPLE = 'The quick brown fox jumps over the lazy dog'

type Selection = { font: CatalogFont; weights: number[]; italic: boolean; local: boolean }
type Notice = { kind: 'ok' | 'error'; text: string }
type FontResponse = { ok: true; font: InstalledFont } | { ok: false; error: string }

const defaultWeights = (font: CatalogFont): number[] => (font.weights.includes(400) ? [400] : font.weights.slice(0, 1))

/** The preview-only shape of a catalog result, for loadFontInAdmin. */
const previewOf = (font: CatalogFont, weights: number[], italic: boolean): InstalledFont => ({
  id: font.id,
  family: font.family,
  source: font.type === 'google' ? 'google' : 'fontsource',
  ...(font.category ? { category: font.category } : {}),
  weights,
  italic,
  local: false,
  files: {},
})

async function readFontResponse(response: Response): Promise<FontResponse> {
  const body = (await response.json().catch(() => ({}))) as { font?: unknown; error?: string }
  if (!response.ok) return { ok: false, error: body.error ?? 'Request failed.' }
  const [font] = sanitizeInstalledFonts([body.font])
  return font ? { ok: true, font } : { ok: false, error: 'The server returned a font this site cannot use.' }
}

/**
 * Admin editor for the theme's custom fonts. Searches the Fontsource catalog,
 * previews a result before installing it, uploads font files, and keeps the
 * installed list. Everything is written into the form's value; nothing is
 * saved until the page itself is saved.
 */
export function FontsManagerField({ field, path, readOnly }: FontsManagerFieldProps) {
  const { value, setValue } = useField<unknown>({ path })
  const installed = sanitizeInstalledFonts(value)

  const [query, setQuery] = useState('')
  const [source, setSource] = useState<SourceFilter>('all')
  const [results, setResults] = useState<CatalogFont[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadFamily, setUploadFamily] = useState('')
  const [uploadWeight, setUploadWeight] = useState<number>(400)
  const [uploadStyle, setUploadStyle] = useState<'normal' | 'italic'>('normal')

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSearch = useRef(0)

  // Make every installed font render in the admin, including after a reload.
  useEffect(() => {
    for (const font of sanitizeInstalledFonts(value)) loadFontInAdmin(font)
  }, [value])

  const runSearch = async (text: string, filter: SourceFilter) => {
    const requestId = ++latestSearch.current
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearchError(null)
      setSearching(false)
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams({ q: text.trim(), source: filter })
      const response = await fetch(`/api/admin-fonts-search?${params.toString()}`, { credentials: 'same-origin' })
      const body = (await response.json().catch(() => ({}))) as { results?: CatalogFont[]; error?: string }
      if (requestId !== latestSearch.current) return
      if (!response.ok) {
        setResults([])
        setSearchError(body.error ?? 'Search failed.')
        return
      }
      setResults(body.results ?? [])
    } catch {
      if (requestId === latestSearch.current) {
        setResults([])
        setSearchError('Search failed. Check your connection and try again.')
      }
    } finally {
      if (requestId === latestSearch.current) setSearching(false)
    }
  }

  // Debounced from the event handlers themselves, not from an effect.
  const scheduleSearch = (text: string, filter: SourceFilter) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      void runSearch(text, filter)
    }, SEARCH_DELAY_MS)
  }

  const choose = (font: CatalogFont) => {
    const weights = defaultWeights(font)
    setSelection({ font, weights, italic: false, local: false })
    setNotice(null)
    loadFontInAdmin(previewOf(font, weights, false))
  }

  const updateSelection = (next: Selection) => {
    setSelection(next)
    loadFontInAdmin(previewOf(next.font, next.weights, next.italic))
  }

  const toggleWeight = (weight: number) => {
    if (!selection) return
    const weights = selection.weights.includes(weight)
      ? selection.weights.filter((w) => w !== weight)
      : [...selection.weights, weight].sort((a, b) => a - b)
    updateSelection({ ...selection, weights })
  }

  const addFont = async (request: () => Promise<Response>, successText: (font: InstalledFont) => string) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await readFontResponse(await request())
      if (result.ok === false) {
        setNotice({ kind: 'error', text: result.error })
        return
      }
      setValue(mergeInstalledFont(installed, result.font))
      loadFontInAdmin(result.font)
      setNotice({ kind: 'ok', text: successText(result.font) })
    } catch {
      setNotice({ kind: 'error', text: 'Request failed. Check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  const install = () => {
    if (!selection || busy) return
    const { font, weights, italic, local } = selection
    void addFont(
      () =>
        fetch('/api/admin-fonts-install', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id: font.id, weights, italic, local }),
        }),
      (installedFont) => `${installedFont.family} added. Save the page to publish it.`,
    )
  }

  const upload = () => {
    if (!uploadFile || busy) {
      setNotice({ kind: 'error', text: 'Choose a font file first.' })
      return
    }
    const form = new FormData()
    form.append('file', uploadFile)
    form.append('family', uploadFamily)
    form.append('weight', String(uploadWeight))
    form.append('style', uploadStyle)
    void addFont(
      () => fetch('/api/admin-fonts-upload', { method: 'POST', body: form, credentials: 'same-origin' }),
      (uploaded) => `${uploaded.family} ${uploadWeight} ${uploadStyle} uploaded. Save the page to publish it.`,
    ).then(() => setUploadFile(null))
  }

  const chooseUploadFile = (file: File | null) => {
    setUploadFile(file)
    if (file && uploadFamily.trim() === '') {
      setUploadFamily(file.name.replace(/\.(woff2?|ttf)$/i, '').replace(/[_]+/g, ' ').slice(0, 60))
    }
  }

  const remove = (id: string) => {
    setValue(removeInstalledFont(installed, id))
    setNotice(null)
  }

  const sourceLabel = (font: InstalledFont): string =>
    font.source === 'google' ? 'Google Fonts' : font.source === 'upload' ? 'Uploaded' : 'Fontsource'

  return (
    <div className="field-type fm-root">
      <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />

      <section className="fm-panel" aria-label="Find a font">
        <div className="fm-row">
          <input
            className="fm-input"
            type="search"
            placeholder="Search for a font family, e.g. Lora"
            value={query}
            disabled={readOnly}
            aria-label="Search font families"
            onChange={(event) => {
              const text = event.target.value
              setQuery(text)
              scheduleSearch(text, source)
            }}
          />
          <select
            className="fm-select"
            value={source}
            disabled={readOnly}
            aria-label="Catalog"
            onChange={(event) => {
              const next = event.target.value as SourceFilter
              setSource(next)
              scheduleSearch(query, next)
            }}
          >
            {(Object.keys(SOURCE_LABELS) as SourceFilter[]).map((key) => (
              <option key={key} value={key}>
                {SOURCE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {searching && <p className="fm-hint" role="status">Searching...</p>}
        {searchError && <p className="fm-error" role="alert">{searchError}</p>}
        {!searching && !searchError && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
          <p className="fm-hint">No matching families.</p>
        )}
        {results.length > 0 && (
          <ul className="fm-results">
            {results.map((font) => (
              <li key={font.id}>
                <button
                  type="button"
                  className="fm-result"
                  aria-pressed={selection?.font.id === font.id}
                  disabled={readOnly}
                  onClick={() => choose(font)}
                >
                  <span>{font.family}</span>
                  <span className="fm-tag">
                    {font.type === 'google' ? 'Google' : 'Fontsource'}
                    {font.category ? ` · ${font.category}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selection && (
          <div className="fm-panel" aria-label="Install options">
            <p className="fm-sample" style={{ fontFamily: fontStack(selection.font.family, selection.font.category) }}>
              {SAMPLE}
            </p>
            <div className="fm-checks" role="group" aria-label="Weights">
              {selection.font.weights.map((weight) => (
                <label key={weight}>
                  <input
                    type="checkbox"
                    checked={selection.weights.includes(weight)}
                    disabled={readOnly || busy}
                    onChange={() => toggleWeight(weight)}
                  />
                  {weight}
                </label>
              ))}
            </div>
            <div className="fm-checks">
              {selection.font.styles.includes('italic') && (
                <label>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={selection.italic}
                    disabled={readOnly || busy}
                    onChange={() => updateSelection({ ...selection, italic: !selection.italic })}
                  />
                  Italic
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  role="switch"
                  checked={selection.local}
                  disabled={readOnly || busy}
                  onChange={() => updateSelection({ ...selection, local: !selection.local })}
                />
                Host locally
              </label>
            </div>
            <p className="fm-hint">
              {selection.local
                ? 'The font files are copied to this site. Nothing is requested from a third party.'
                : selection.font.type === 'google'
                  ? 'Served from Google Fonts when the site loads.'
                  : 'Served from jsDelivr when the site loads.'}
            </p>
            <div className="fm-row">
              <button
                type="button"
                className="fm-button"
                disabled={readOnly || busy || selection.weights.length === 0}
                onClick={install}
              >
                {busy ? 'Installing...' : 'Install font'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="fm-panel" aria-label="Upload a font">
        <p className="fm-meta">Upload a WOFF2, WOFF or TTF file, 2 MB at most. Each file is one weight and style of a family.</p>
        <div className="fm-row">
          <input
            type="file"
            accept=".woff2,.woff,.ttf,font/woff2,font/woff,font/ttf"
            disabled={readOnly || busy}
            aria-label="Font file"
            onChange={(event) => chooseUploadFile(event.target.files?.[0] ?? null)}
          />
          <input
            className="fm-input"
            type="text"
            placeholder="Family name"
            maxLength={60}
            value={uploadFamily}
            disabled={readOnly || busy}
            aria-label="Family name"
            onChange={(event) => setUploadFamily(event.target.value)}
          />
          <select
            className="fm-select"
            value={uploadWeight}
            disabled={readOnly || busy}
            aria-label="Weight"
            onChange={(event) => setUploadWeight(Number(event.target.value))}
          >
            {ALLOWED_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
          <select
            className="fm-select"
            value={uploadStyle}
            disabled={readOnly || busy}
            aria-label="Style"
            onChange={(event) => setUploadStyle(event.target.value === 'italic' ? 'italic' : 'normal')}
          >
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
          <button type="button" className="fm-button" disabled={readOnly || busy || !uploadFile} onClick={upload}>
            Upload
          </button>
        </div>
      </section>

      <section className="fm-panel" aria-label="Installed fonts">
        <p className="fm-meta">
          {installed.length === 0 ? 'No custom fonts installed.' : `${installed.length} installed. Choose one for the heading or body font above.`}
        </p>
        {installed.length > 0 && (
          <ul className="fm-installed">
            {installed.map((font) => (
              <li key={font.id}>
                <div>
                  <div className="fm-installed-name" style={{ fontFamily: fontStack(font.family, font.category) }}>
                    {font.family}
                  </div>
                  <p className="fm-meta">
                    {sourceLabel(font)} · weights {font.weights.join(', ')}
                    {font.italic ? ' · italic' : ''}
                    {font.local ? ' · hosted here' : ''}
                  </p>
                </div>
                <button type="button" className="fm-button fm-button--danger" disabled={readOnly || busy} onClick={() => remove(font.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="fm-hint">Removing a font does not delete files already hosted on this site.</p>
      </section>

      {notice && (
        <p className={notice.kind === 'ok' ? 'fm-ok' : 'fm-error'} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      {field.admin?.description && <p className="fm-hint">{String(field.admin.description)}</p>}
    </div>
  )
}
