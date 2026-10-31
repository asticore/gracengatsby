'use client'

import React, { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { setFormEmbed } from '@/features/forms/embedActions'
import { embedOutputs, parseAllowedOrigins, type EmbedRow } from '@/features/forms/embedAdmin'

/**
 * External embeds: every form, whether it may be shown on other websites, and the snippets to place there.
 * The website box is one per line; an empty box means any website. Changes go through setFormEmbed, which
 * checks the permission again on the server.
 */

const noopSubscribe = (): (() => void) => () => undefined
const siteOrigin = (): string => window.location.origin

function Copy({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="ve-btn ve-btn--ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? done : label}
    </button>
  )
}

function Row({ row, origin, canChange }: { row: EmbedRow; origin: string; canChange: boolean }) {
  const t = useAdminT()
  const router = useRouter()
  const [text, setText] = useState(row.allowedOrigins.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const out = row.embedKey && origin ? embedOutputs(row.embedKey, origin) : null

  const save = async (enabled: boolean) => {
    const parsed = parseAllowedOrigins(text)
    if (parsed.invalid.length) {
      setError(t('extEmbeds.invalid'))
      return
    }
    setBusy(true)
    setError(null)
    const result = await setFormEmbed({ id: row.id, enabled, allowedOrigins: parsed.origins })
    setBusy(false)
    if ('error' in result) setError(result.error)
    else router.refresh()
  }

  return (
    <li className="ext-embed" style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: '1rem' }}>
        {row.title} <span className="doc-muted">({row.published ? t('extEmbeds.published') : t('extEmbeds.draftStatus')})</span>
      </h3>
      <p>
        {t('extEmbeds.embedding')}: <strong>{row.enabled ? t('extEmbeds.on') : t('extEmbeds.off')}</strong>
        {!row.published && <span className="doc-muted"> {t('extEmbeds.draftNote')}</span>}
      </p>
      {out ? (
        <>
          <label className="ve-field ve-field--full">
            <span>{t('extEmbeds.hostedUrl')}</span>
            <input readOnly value={out.hostedUrl} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <label className="ve-field ve-field--full">
            <span>{t('extEmbeds.scriptSnippet')}</span>
            <textarea readOnly rows={2} value={out.scriptSnippet} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <p>
            <Copy text={out.scriptSnippet} label={t('extEmbeds.copyScript')} done={t('extEmbeds.copied')} />
          </p>
          <label className="ve-field ve-field--full">
            <span>{t('extEmbeds.iframeSnippet')}</span>
            <textarea readOnly rows={3} value={out.iframeSnippet} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <p>
            <Copy text={out.iframeSnippet} label={t('extEmbeds.copyIframe')} done={t('extEmbeds.copied')} />
          </p>
        </>
      ) : (
        <p className="doc-muted">{t('extEmbeds.noKey')}</p>
      )}
      <label className="ve-field ve-field--full">
        <span>{t('extEmbeds.domains')}</span>
        <textarea rows={3} value={text} disabled={!canChange} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="doc-muted">{row.allowedOrigins.length === 0 ? t('extEmbeds.anyWebsite') : t('extEmbeds.onlyThese')}</p>
      {canChange && (
        <p style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => save(row.enabled)}>
            {t('extEmbeds.save')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => save(!row.enabled)}>
            {row.enabled ? t('extEmbeds.disable') : t('extEmbeds.enable')}
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  )
}

export function ExternalEmbedsPanel({ rows, canChange }: { rows: EmbedRow[]; canChange: boolean }) {
  const t = useAdminT()
  const origin = useSyncExternalStore(noopSubscribe, siteOrigin, () => '')
  if (rows.length === 0) return <p className="doc-muted">{t('extEmbeds.none')}</p>
  return (
    <div>
      <p className="doc-muted">{t('extEmbeds.intro')}</p>
      {!canChange && <p className="doc-muted">{t('extEmbeds.readOnly')}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rows.map((row) => (
          <Row key={String(row.id)} row={row} origin={origin} canChange={canChange} />
        ))}
      </ul>
    </div>
  )
}

/** Create: the same save, for a form not yet embedded. Choosing a form and its websites turns embedding on. */
export function NewEmbedForm({ rows }: { rows: EmbedRow[] }) {
  const t = useAdminT()
  const router = useRouter()
  const candidates = rows.filter((row) => !row.enabled)
  const [formId, setFormId] = useState<string>(candidates[0] ? String(candidates[0].id) : '')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (candidates.length === 0) return null
  const create = async () => {
    const parsed = parseAllowedOrigins(text)
    if (parsed.invalid.length) return setError(t('extEmbeds.invalid'))
    const result = await setFormEmbed({ id: formId, enabled: true, allowedOrigins: parsed.origins })
    if ('error' in result) setError(result.error)
    else router.refresh()
  }
  return (
    <section aria-label={t('extEmbeds.newTitle')} style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: '1rem' }}>{t('extEmbeds.newTitle')}</h2>
      <label className="ve-field">
        <span>{t('extEmbeds.pickForm')}</span>
        <select value={formId} onChange={(e) => setFormId(e.target.value)}>
          {candidates.map((row) => (
            <option key={String(row.id)} value={String(row.id)}>
              {row.title}
            </option>
          ))}
        </select>
      </label>
      <label className="ve-field ve-field--full">
        <span>{t('extEmbeds.domains')}</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p>
        <button type="button" className="btn btn--primary" onClick={create}>
          {t('extEmbeds.create')}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
