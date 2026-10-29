'use client'
import { adminCollectionPath } from '@/admin/adminPaths'

import { useEffect, useState, type FormEvent } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { useDocumentInfo } from '@/engine/ui'

import { MediaUploader } from '@/views/media/MediaUploader'

import { describeSaving, postJson, requestJson } from './mediaApi'
import { loadUploadRules } from './uploadClient'

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
 * Tools shown above the form on a media document: replace the file, copy its
 * address, optimise it and write alt text (pictures only), and see where it is used.
 *
 * Changes made here are saved straight to the picture, not through the form.
 * So after one succeeds the page reloads - otherwise the form would save the
 * old values back over the new ones.
 */
export function MediaEditPanel() {
  const { id, collectionSlug } = useDocumentInfo()
  if (collectionSlug !== 'media') return null
  if (id === undefined || id === null) return <MediaCreatePanel />
  return <MediaEditPanelInner id={Number(id)} />
}

/**
 * The create screen. The form below it has no file input of its own, so a
 * document could never be created from it; this is where the file is chosen.
 * Uploading saves straight away and opens the new file's page to add details.
 */
function MediaCreatePanel() {
  const t = useAdminT()
  return (
    <section aria-label={t('md.lit.upload_files_aria')} className="mb-[16px] flex flex-col gap-[8px] rounded-[6px] border border-[var(--theme-elevation-150)] p-[14px]">
      <p className="m-0 text-[12px] text-[var(--theme-elevation-600)]">
        {t('md.lit.create_hint')}
      </p>
      <MediaUploader
        scope="inline"
        onUploaded={(docs) => {
          window.location.assign(docs.length === 1 ? `/admin/content/media/${docs[0].id}` : adminCollectionPath('media'))
        }}
      />
    </section>
  )
}

function MediaEditPanelInner({ id }: { id: number }) {
  const t = useAdminT()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [provider, setProvider] = useState<Provider>('claude')
  const [keys, setKeys] = useState<Record<Provider, boolean> | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [stored, setStored] = useState<{ url: string | null; mimeType: string | null } | null>(null)
  const [accept, setAccept] = useState<string | undefined>(undefined)

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

  useEffect(() => {
    let active = true
    void requestJson<{ media: { url: string | null; mimeType: string | null } }>(`/api/admin-media-usage?id=${id}&scan=0`).then((result) => {
      if (active && result.ok === true) setStored({ url: result.data.media.url, mimeType: result.data.media.mimeType })
    })
    void loadUploadRules().then((rules) => {
      if (active && rules) setAccept(rules.accept.join(','))
    })
    return () => {
      active = false
    }
  }, [id])

  const isPicture = stored?.mimeType ? stored.mimeType.startsWith('image/') : true

  const copyUrl = async () => {
    if (!stored?.url) return
    const absolute = new URL(stored.url, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(absolute)
      setMessage({ kind: 'ok', text: t('md.lit.address_copied') })
    } catch {
      window.prompt(t('md.lit.copy_address_prompt'), absolute)
    }
  }

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
      if (!item) return { ok: false, error: t('md.lit.nothing_optimised') }
      if (item.status === 'optimised') {
        return { ok: true, text: t('md.lit.optimised_saving', { saving: describeSaving(item.before, item.after) }), reload: true }
      }
      return { ok: false, error: item.reason ?? t('md.lit.picture_not_changed') }
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
      if (item?.status === 'updated') return { ok: true, text: t('md.lit.alt_written'), reload: true }
      return { ok: false, error: item?.reason ?? t('md.lit.alt_not_written') }
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
      return { ok: true, text: t('md.lit.file_replaced', { note }), reload: true }
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
      aria-label={t('md.lit.tools_aria')}
      className="mb-[16px] flex flex-col gap-[12px] rounded-[6px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-25,transparent)] p-[14px]"
    >
      <p className="m-0 text-[12px] text-[var(--theme-elevation-600)]">
        {t('md.lit.tools_hint')}
      </p>

      <div className="flex flex-wrap items-center gap-[8px]">
        {isPicture ? (
          <button type="button" className={buttonClass} disabled={busy !== null} onClick={optimise}>
            {busy === 'optimise' ? t('md.lit.optimising') : t('md.lit.optimise')}
          </button>
        ) : null}
        {stored?.url ? (
          <>
            <button type="button" className={buttonClass} onClick={copyUrl}>
              {t('md.lit.copy_url')}
            </button>
            <a href={stored.url} target="_blank" rel="noopener noreferrer" className={`${buttonClass} no-underline`}>
              {isPicture ? t('md.lit.open') : t('md.lit.download')}
            </a>
          </>
        ) : null}

        {isPicture ? (
        <label className="flex items-center gap-[6px] text-[12px] text-[var(--theme-elevation-700)]">
          {t('md.lit.alt_text_with')}
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className="rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[6px] py-[5px] text-[12px]"
          >
            <option value="claude" disabled={keys !== null && !keys.claude}>
              Claude{keys && !keys.claude ? ` ${t('md.lit.no_key')}` : ''}
            </option>
            <option value="openai" disabled={keys !== null && !keys.openai}>
              OpenAI{keys && !keys.openai ? ` ${t('md.lit.no_key')}` : ''}
            </option>
          </select>
        </label>
        ) : null}
        {isPicture ? (
          <button type="button" className={buttonClass} disabled={busy !== null} onClick={writeAlt}>
            {busy === 'alt' ? t('md.lit.writing') : t('md.lit.generate_alt')}
          </button>
        ) : null}

        <button type="button" className={buttonClass} disabled={busy !== null} onClick={checkUsage}>
          {busy === 'usage' ? t('md.lit.checking') : t('md.lit.where_used')}
        </button>
      </div>

      <form onSubmit={replace} className="flex flex-wrap items-center gap-[8px]">
        <input
          type="file"
          accept={accept}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-[12px]"
        />
        <button type="submit" className={buttonClass} disabled={!file || busy !== null}>
          {busy === 'replace' ? t('md.lit.replacing') : t('md.lit.replace_file')}
        </button>
        <span className="text-[11px] text-[var(--theme-elevation-500)]">{t('md.lit.filename_stays')}</span>
      </form>

      {usage ? (
        <div className="flex flex-col gap-[6px] text-[12px] text-[var(--theme-elevation-800)]">
          {usage.count === 0 ? (
            <p className="m-0">{t('md.lit.not_used')}</p>
          ) : (
            <>
              <p className="m-0 font-medium">
                {t(usage.count === 1 ? 'md.lit.used_in_one' : 'md.lit.used_in_other', { count: usage.count })}
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
            <p className="m-0 text-[var(--theme-elevation-500)]">{t('md.lit.could_not_check', { list: usage.unchecked.join(', ') })}</p>
          ) : null}
          {usage.truncated.length > 0 ? (
            <p className="m-0 text-[var(--theme-elevation-500)]">{t('md.lit.only_first_500', { list: usage.truncated.join(', ') })}</p>
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
