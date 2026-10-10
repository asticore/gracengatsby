'use client'

import { useEffect, useState, type FormEvent } from 'react'

import { useDocumentInfo } from '@/engine/ui'

import { describeSaving, postJson, requestJson } from './mediaApi'

type Provider = 'claude' | 'openai'

type UsageResponse = {
  media: { url: string | null; mimeType: string | null; filesize?: number | null }
  count: number
  references: Array<{ type: string; collection: string; title: string; field: string; editUrl: string }>
  unchecked: string[]
  truncated: string[]
}

type OptimiseResponse = {
  results: Array<{ status: string; reason?: string; before: number | null; after: number | null }>
}

const buttonClass =
  'rounded-[4px] border border-[var(--theme-elevation-200)] px-[10px] py-[6px] text-[12px] text-[var(--theme-elevation-800)] hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)] disabled:opacity-50'

/**
 * Tools shown above the form on a media document: replace the file, optimise
 * it, write alt text, and see where it is used.
 *
 * Changes made here are saved straight to the picture, not through the form.
 * So after one succeeds the page reloads - otherwise the form would save the
 * old values back over the new ones.
 */
export function MediaEditPanel() {
  const { id, collectionSlug } = useDocumentInfo()
  if (collectionSlug !== 'media' || id === undefined || id === null) return null
  return <MediaEditPanelInner id={Number(id)} />
}

function MediaEditPanelInner({ id }: { id: number }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [provider, setProvider] = useState<Provider>('claude')
  const [keys, setKeys] = useState<Record<Provider, boolean> | null>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    let active = true
    requestJson<{ providers: Record<Provider, boolean> }>('/api/admin-media-alt').then((result) => {
      if (!active || result.ok === false) return
      setKeys(result.data.providers)
      if (!result.data.providers.claude && result.data.providers.openai) setProvider('openai')
    })
    return () => {
      active = false
    }
  }, [])

  const run = async (label: string, task: () => Promise<{ ok: true; text: string; reload: boolean } | { ok: false; error: string }>) => {
    setBusy(label)
    setMessage(null)
    const outcome = await task()
    setBusy(null)
    if (outcome.ok === true) {
      setMessage({ kind: 'ok', text: outcome.text })
      if (outcome.reload) window.location.reload()
    } else {
      setMessage({ kind: 'error', text: outcome.error })
    }
  }

  const optimise = () =>
    run('optimise', async () => {
      const result = await postJson<OptimiseResponse>('/api/admin-media-optimise', { ids: [id] })
      if (result.ok === false) return { ok: false, error: result.error }
      const item = result.data.results[0]
      if (!item) return { ok: false, error: 'Nothing was optimised.' }
      if (item.status === 'optimised') {
        return { ok: true, text: `Optimised: ${describeSaving(item.before, item.after)}. Reloading...`, reload: true }
      }
      return { ok: false, error: item.reason ?? 'This picture was not changed.' }
    })

  const writeAlt = () =>
    run('alt', async () => {
      const result = await postJson<{ results: Array<{ status: string; reason?: string }> }>('/api/admin-media-alt', {
        ids: [id],
        provider,
        overwrite: true,
      })
      if (result.ok === false) return { ok: false, error: result.error }
      const item = result.data.results[0]
      if (item?.status === 'updated') return { ok: true, text: 'Alt text written. Reloading...', reload: true }
      return { ok: false, error: item?.reason ?? 'Alt text could not be written.' }
    })

  const replace = (event: FormEvent) => {
    event.preventDefault()
    if (!file) return
    void run('replace', async () => {
      const form = new FormData()
      form.append('file', file)
      const result = await requestJson<{ skipped?: string | null }>(`/api/admin-media-replace/${id}`, { method: 'POST', body: form })
      if (result.ok === false) return { ok: false, error: result.error }
      const note = result.data.skipped ? ` ${result.data.skipped}` : ''
      return { ok: true, text: `File replaced.${note} Reloading...`, reload: true }
    })
  }

  const checkUsage = async () => {
    setBusy('usage')
    setMessage(null)
    const result = await requestJson<UsageResponse>(`/api/admin-media-usage?id=${id}`)
    setBusy(null)
    if (result.ok === true) setUsage(result.data)
    else setMessage({ kind: 'error', text: result.error })
  }

  return (
    <section
      aria-label="Media tools"
      className="mb-[16px] flex flex-col gap-[12px] rounded-[6px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-25,transparent)] p-[14px]"
    >
      <p className="m-0 text-[12px] text-[var(--theme-elevation-600)]">
        These tools save straight to the picture. Save any changes to the fields below first - the page reloads after each change.
      </p>

      <div className="flex flex-wrap items-center gap-[8px]">
        <button type="button" className={buttonClass} disabled={busy !== null} onClick={optimise}>
          {busy === 'optimise' ? 'Optimising...' : 'Optimise this picture'}
        </button>

        <label className="flex items-center gap-[6px] text-[12px] text-[var(--theme-elevation-700)]">
          Alt text with
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className="rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[6px] py-[5px] text-[12px]"
          >
            <option value="claude" disabled={keys !== null && !keys.claude}>
              Claude{keys && !keys.claude ? ' (no key)' : ''}
            </option>
            <option value="openai" disabled={keys !== null && !keys.openai}>
              OpenAI{keys && !keys.openai ? ' (no key)' : ''}
            </option>
          </select>
        </label>
        <button type="button" className={buttonClass} disabled={busy !== null} onClick={writeAlt}>
          {busy === 'alt' ? 'Writing...' : 'Generate alt text'}
        </button>

        <button type="button" className={buttonClass} disabled={busy !== null} onClick={checkUsage}>
          {busy === 'usage' ? 'Checking...' : 'Where is this used?'}
        </button>
      </div>

      <form onSubmit={replace} className="flex flex-wrap items-center gap-[8px]">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-[12px]"
        />
        <button type="submit" className={buttonClass} disabled={!file || busy !== null}>
          {busy === 'replace' ? 'Replacing...' : 'Replace file'}
        </button>
        <span className="text-[11px] text-[var(--theme-elevation-500)]">The filename stays the same, so existing links keep working.</span>
      </form>

      {usage ? (
        <div className="flex flex-col gap-[6px] text-[12px] text-[var(--theme-elevation-800)]">
          {usage.count === 0 ? (
            <p className="m-0">Not used anywhere the library can see.</p>
          ) : (
            <>
              <p className="m-0 font-medium">
                Used in {usage.count} place{usage.count === 1 ? '' : 's'}:
              </p>
              <ul className="m-0 flex list-none flex-col gap-[3px] p-0">
                {usage.references.map((reference, index) => (
                  <li key={`${reference.collection}-${reference.field}-${index}`}>
                    <a href={reference.editUrl} className="text-[var(--ac-gold)] no-underline hover:underline">
                      {reference.title}
                    </a>{' '}
                    <span className="text-[var(--theme-elevation-500)]">
                      ({reference.collection} - {reference.field})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {usage.unchecked.length > 0 ? (
            <p className="m-0 text-[var(--theme-elevation-500)]">Could not check: {usage.unchecked.join(', ')}. The list may be incomplete.</p>
          ) : null}
          {usage.truncated.length > 0 ? (
            <p className="m-0 text-[var(--theme-elevation-500)]">Only the first 500 entries of {usage.truncated.join(', ')} were checked.</p>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role="status" className={`m-0 text-[12px] ${message.kind === 'ok' ? 'text-[var(--theme-success-600,#2f855a)]' : 'text-[var(--theme-error-600,#c53030)]'}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  )
}
