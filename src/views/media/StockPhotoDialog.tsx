'use client'

import { useEffect, useState, type FormEvent } from 'react'

import { requestJson, postJson } from '@/features/media/admin/mediaApi'

type Provider = 'openverse' | 'unsplash' | 'pexels' | 'pixabay'

const PROVIDERS: Array<{ value: Provider; label: string; needsKey: boolean }> = [
  { value: 'openverse', label: 'Openverse', needsKey: false },
  { value: 'unsplash', label: 'Unsplash', needsKey: true },
  { value: 'pexels', label: 'Pexels', needsKey: true },
  { value: 'pixabay', label: 'Pixabay', needsKey: true },
]

type StockPhoto = {
  id: string
  provider: Provider
  title: string
  thumb: string
  full: string
  author: string
  authorUrl: string
  license: string
  licenseUrl: string
  sourceUrl: string
  downloadLocation?: string
}

type SearchResponse = { results: StockPhoto[]; total: number; page: number }

const PAGE_SIZE_NOTE = 'Pictures are downloaded when you import them, and the credit is saved with the picture.'

/**
 * Searches royalty-free photo libraries and imports the chosen picture into the
 * media library, with its credit, licence and source saved alongside it.
 */
export function StockPhotoDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [available, setAvailable] = useState<Record<Provider, boolean> | null>(null)
  const [provider, setProvider] = useState<Provider>('openverse')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockPhoto[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    requestJson<{ providers: Record<Provider, boolean> }>('/api/admin-media-stock').then((result) => {
      if (active && result.ok === true) setAvailable(result.data.providers)
    })
    return () => {
      active = false
    }
  }, [])

  const search = async (nextPage: number, event?: FormEvent) => {
    event?.preventDefault()
    const term = query.trim()
    if (term.length < 2) {
      setError('Search for at least two letters.')
      return
    }
    setBusy('search')
    setError(null)
    const params = new URLSearchParams({ provider, q: term, page: String(nextPage) })
    const result = await requestJson<SearchResponse>(`/api/admin-media-stock?${params.toString()}`)
    setBusy(null)
    if (result.ok === false) {
      setError(result.error)
      setResults([])
      return
    }
    setResults(result.data.results)
    setPage(result.data.page)
    setHasMore(result.data.results.length >= 20 && result.data.page * 20 < result.data.total)
  }

  const importPhoto = async (photo: StockPhoto) => {
    setBusy(photo.id)
    setError(null)
    const outcome = await postJson<{ doc: { filename: string; id: number } }>('/api/admin-media-stock-import', {
      provider: photo.provider,
      id: photo.id,
      full: photo.full,
      downloadLocation: photo.downloadLocation,
      title: photo.title,
      author: photo.author,
      authorUrl: photo.authorUrl,
      license: photo.license,
      licenseUrl: photo.licenseUrl,
      sourceUrl: photo.sourceUrl,
    })
    setBusy(null)
    if (outcome.ok === false) {
      setError(outcome.error)
      return
    }
    setImported((current) => ({ ...current, [`${photo.provider}:${photo.id}`]: outcome.data.doc.filename }))
    onImported()
  }

  const keyed = PROVIDERS.find((item) => item.value === provider)?.needsKey ?? false
  const providerReady = !keyed || available?.[provider] !== false

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-[16px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-dialog-title"
        className="relative my-[40px] flex w-full max-w-[980px] flex-col gap-[14px] rounded-[8px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-0)] p-[20px] text-[var(--theme-elevation-900)] shadow-xl"
      >
        <div className="flex items-center justify-between gap-[12px]">
          <h2 id="stock-dialog-title" className="m-0 text-[18px] font-semibold">
            Search stock photos
          </h2>
          <button type="button" onClick={onClose} className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[10px] py-[4px] text-[12px] hover:border-[var(--ac-gold)]">
            Close
          </button>
        </div>

        <div role="tablist" aria-label="Photo libraries" className="flex flex-wrap gap-[6px]">
          {PROVIDERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={provider === item.value}
              onClick={() => {
                setProvider(item.value)
                setResults(null)
                setError(null)
              }}
              className={`rounded-[4px] border px-[10px] py-[5px] text-[13px] ${
                provider === item.value ? 'border-[var(--ac-gold)] text-[var(--ac-gold)]' : 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-700)]'
              }`}
            >
              {item.label}
              {item.needsKey && available && !available[item.value] ? ' (no key)' : ''}
            </button>
          ))}
        </div>

        <form onSubmit={(event) => search(1, event)} className="flex gap-[8px]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a subject, for example harbour at dusk"
            aria-label="Search term"
            className="flex-1 rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[10px] py-[7px] text-[14px]"
          />
          <button
            type="submit"
            disabled={busy !== null || !providerReady}
            className="rounded-[4px] border border-[var(--ac-gold)] px-[14px] py-[7px] text-[13px] text-[var(--ac-gold)] disabled:opacity-50"
          >
            {busy === 'search' ? 'Searching...' : 'Search'}
          </button>
        </form>

        {!providerReady ? (
          <p className="m-0 text-[13px] text-[var(--theme-elevation-600)]">
            Add the {PROVIDERS.find((item) => item.value === provider)?.label} key in Media settings to search this library.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-[13px] text-[var(--theme-error-600,#c53030)]">
            {error}
          </p>
        ) : null}

        {results && results.length === 0 && !error ? (
          <p className="m-0 text-[13px] text-[var(--theme-elevation-600)]">No pictures matched that search.</p>
        ) : null}

        {results && results.length > 0 ? (
          <>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-[10px] p-0">
              {results.map((photo) => {
                const key = `${photo.provider}:${photo.id}`
                const done = imported[key]
                return (
                  <li key={key} className="flex flex-col overflow-hidden rounded-[4px] border border-[var(--theme-elevation-150)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- third-party thumbnail, sized by the grid */}
                    <img src={photo.thumb} alt={photo.title || 'Stock photo'} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    <div className="flex flex-1 flex-col gap-[4px] p-[8px]">
                      <span className="text-[11px] text-[var(--theme-elevation-700)]">
                        {photo.author ? `Photo by ${photo.author}` : 'Credit not given'}
                      </span>
                      <span className="text-[11px] text-[var(--theme-elevation-500)]">{photo.license || 'Licence on source page'}</span>
                      <button
                        type="button"
                        disabled={busy !== null || Boolean(done)}
                        onClick={() => importPhoto(photo)}
                        className="mt-auto rounded-[4px] border border-[var(--ac-gold)] px-[8px] py-[4px] text-[12px] text-[var(--ac-gold)] disabled:opacity-50"
                      >
                        {done ? 'Imported' : busy === photo.id ? 'Importing...' : 'Import'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1 || busy !== null}
                onClick={() => search(page - 1)}
                className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[10px] py-[4px] text-[12px] disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-[12px] text-[var(--theme-elevation-600)]">Page {page}</span>
              <button
                type="button"
                disabled={!hasMore || busy !== null}
                onClick={() => search(page + 1)}
                className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[10px] py-[4px] text-[12px] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        ) : null}

        <p className="m-0 text-[11px] text-[var(--theme-elevation-500)]">{PAGE_SIZE_NOTE}</p>
      </div>
    </div>
  )
}
