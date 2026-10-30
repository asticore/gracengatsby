'use client'

import React, { useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import {
  deleteWebhookAction,
  listDeliveriesAction,
  loadWebhooksAction,
  replayDeliveryAction,
  rotateSecretAction,
  saveWebhookAction,
  setWebhookEnabledAction,
  testWebhookAction,
  type DeliveryView,
  type WebhookView,
  type WebhooksData,
} from '../actions'
import { EVENT_LABEL_KEYS, type WebhookEvent } from '../events'

/**
 * The webhooks builder screen: the list, the editor, the one-time signing secret, the Test button,
 * the delivery log with replay, and the developer guide downloads. Every write is a server action
 * that re-checks the session and the `webhooks` permission. The secret is shown here once, after
 * create or rotate, and is never fetched again.
 */

type Draft = {
  id: number | null
  name: string
  description: string
  url: string
  events: WebhookEvent[]
  template: string
  enabled: boolean
  ratePerMinute: number
}

const blank = (defaultRate: number): Draft => ({ id: null, name: '', description: '', url: '', events: [], template: '', enabled: true, ratePerMinute: defaultRate })

const draftFrom = (w: WebhookView): Draft => ({
  id: w.id,
  name: w.name,
  description: w.description,
  url: w.url,
  events: w.events,
  template: w.template ?? '',
  enabled: w.enabled,
  ratePerMinute: w.ratePerMinute,
})

const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

const DOWNLOADS = [
  { format: 'guide.md', labelKey: 'webhooks.docs.markdown' },
  { format: 'guide.html', labelKey: 'webhooks.docs.html' },
] as const

export const WebhooksPanel: React.FC<{ initial: WebhooksData }> = ({ initial }) => {
  const t = useAdminT()
  const [hooks, setHooks] = useState<WebhookView[]>(initial.webhooks)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([])

  const fail = (error: string) => setNotice({ tone: 'error', text: error })
  const eventLabel = (event: WebhookEvent) => t(EVENT_LABEL_KEYS[event] as never)

  const refresh = async () => {
    const result = await loadWebhooksAction()
    if (result.ok) setHooks(result.value?.webhooks ?? [])
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setNotice(null)
    const { id, ...input } = draft
    const result = await saveWebhookAction(id, input)
    setBusy(false)
    if (result.ok === false) return fail(result.error)
    const saved = result.value!
    setHooks((list) => (id === null ? [...list, saved.webhook].sort((a, b) => a.name.localeCompare(b.name)) : list.map((x) => (x.id === saved.webhook.id ? saved.webhook : x))))
    if (saved.secret) setSecret({ name: saved.webhook.name, value: saved.secret })
    setDraft(null)
    setNotice({ tone: 'ok', text: t('webhooks.saved') })
  }

  const rotate = async () => {
    if (!draft || draft.id === null) return
    if (!window.confirm(t('webhooks.secret.rotateConfirm'))) return
    const result = await rotateSecretAction(draft.id)
    if (result.ok === false) return fail(result.error)
    setSecret({ name: draft.name, value: result.value!.secret })
    setNotice({ tone: 'ok', text: t('webhooks.secret.rotated') })
  }

  const remove = async (w: WebhookView) => {
    if (!window.confirm(t('webhooks.deleteConfirm'))) return
    const result = await deleteWebhookAction(w.id)
    if (result.ok === false) return fail(result.error)
    setHooks((list) => list.filter((x) => x.id !== w.id))
    if (selectedId === w.id) setSelectedId(null)
    setNotice({ tone: 'ok', text: t('webhooks.deleted') })
  }

  const flip = async (w: WebhookView) => {
    const result = await setWebhookEnabledAction(w.id, !w.enabled)
    if (result.ok === false) return fail(result.error)
    setHooks((list) => list.map((x) => (x.id === w.id ? result.value! : x)))
  }

  const test = async (w: WebhookView) => {
    setNotice(null)
    const result = await testWebhookAction(w.id)
    if (result.ok === false) return fail(result.error)
    const outcome = result.value!
    if (outcome.status === 'ok') setNotice({ tone: 'ok', text: t('webhooks.test.ok', { code: outcome.statusCode ?? 200 }) })
    else setNotice({ tone: 'error', text: t('webhooks.test.failed', { error: outcome.error ?? '' }) })
    await refresh()
    if (selectedId === w.id) await showDeliveries(w)
  }

  const showDeliveries = async (w: WebhookView) => {
    setSelectedId(w.id)
    const result = await listDeliveriesAction(w.id)
    setDeliveries(result.ok ? (result.value ?? []) : [])
  }

  const replay = async (row: DeliveryView, w: WebhookView) => {
    const result = await replayDeliveryAction(row.id)
    if (result.ok === false) return fail(result.error)
    const outcome = result.value!
    setNotice(outcome.status === 'ok' ? { tone: 'ok', text: t('webhooks.deliveries.replayed', { result: t('webhooks.status.ok') }) } : { tone: 'error', text: t('webhooks.deliveries.replayFailed', { error: outcome.error ?? '' }) })
    await showDeliveries(w)
    await refresh()
  }

  const copySecret = async () => {
    try {
      await navigator.clipboard?.writeText(secret?.value ?? '')
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const selected = hooks.find((w) => w.id === selectedId) ?? null
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const statusLabel = (status: string) => t(`webhooks.status.${status}` as never)

  return (
    <div style={{ maxWidth: 1040, padding: '1.5rem', display: 'grid', gap: '1.5rem' }}>
      <p>{t('webhooks.intro')}</p>
      {!initial.secretsReady && <p role="status">{t('webhooks.secretsOff')}</p>}
      <p>{t('webhooks.limits.help', { max: initial.limits.maxWebhooks, rate: initial.limits.defaultRate })}</p>
      {notice && (
        <p role="status" style={{ color: notice.tone === 'error' ? 'var(--color-danger, #b00020)' : 'inherit' }}>
          {notice.text}
        </p>
      )}

      {secret && (
        <section role="region" aria-label={t('webhooks.secret.title')} style={{ display: 'grid', gap: '0.5rem', border: '1px solid currentColor', padding: '1rem', borderRadius: 6 }}>
          <strong>{t('webhooks.secret.title')}: {secret.name}</strong>
          <p>{t('webhooks.secret.once')}</p>
          <code style={{ wordBreak: 'break-all' }}>{secret.value}</code>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={copySecret}>
              {copied ? t('webhooks.secret.copied') : t('webhooks.secret.copy')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSecret(null)
                setCopied(false)
              }}
            >
              {t('webhooks.secret.done')}
            </button>
          </div>
        </section>
      )}

      {!draft && (
        <section style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <button type="button" onClick={() => { setNotice(null); setDraft(blank(initial.limits.defaultRate)) }} disabled={!initial.secretsReady || hooks.length >= initial.limits.maxWebhooks}>
              {t('webhooks.new')}
            </button>
          </div>
          {hooks.length === 0 ? (
            <p>{t('webhooks.none')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('webhooks.columns.name')}</th>
                  <th scope="col">{t('webhooks.columns.address')}</th>
                  <th scope="col">{t('webhooks.columns.events')}</th>
                  <th scope="col">{t('webhooks.columns.enabled')}</th>
                  <th scope="col">{t('webhooks.columns.last')}</th>
                  <th scope="col">{t('webhooks.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {hooks.map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td>
                      <code>{w.host}</code>
                    </td>
                    <td>{w.events.map(eventLabel).join(', ')}</td>
                    <td>
                      <input type="checkbox" checked={w.enabled} onChange={() => flip(w)} aria-label={t('webhooks.enabledLabel')} />
                    </td>
                    <td>
                      {w.last ? `${statusLabel(w.last.status)}${w.last.statusCode ? ` (${w.last.statusCode})` : ''} · ${new Date(w.last.at).toLocaleString()}` : t('webhooks.last.none')}
                    </td>
                    <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => { setNotice(null); setDraft(draftFrom(w)) }}>
                        {t('webhooks.edit')}
                      </button>
                      <button type="button" onClick={() => test(w)} disabled={!initial.secretsReady}>
                        {t('webhooks.test')}
                      </button>
                      <button type="button" onClick={() => showDeliveries(w)}>
                        {t('webhooks.deliveries.open')}
                      </button>
                      <button type="button" onClick={() => remove(w)}>
                        {t('webhooks.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {draft && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            void save()
          }}
          style={{ display: 'grid', gap: '1.25rem' }}
        >
          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('webhooks.section.basics')}</legend>
            <label>
              {t('webhooks.field.name')}
              <input value={draft.name} onChange={(ev) => set('name', ev.target.value)} maxLength={80} required />
            </label>
            <label>
              {t('webhooks.field.description')}
              <input value={draft.description} onChange={(ev) => set('description', ev.target.value)} maxLength={300} />
            </label>
            <label>
              {t('webhooks.field.url')}
              <input type="url" value={draft.url} onChange={(ev) => set('url', ev.target.value)} maxLength={500} placeholder="https://hooks.example.com/site" required />
            </label>
            <small>{t('webhooks.field.urlHelp')}</small>
            <label>
              <input type="checkbox" checked={draft.enabled} onChange={(ev) => set('enabled', ev.target.checked)} /> {t('webhooks.field.enabled')}
            </label>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('webhooks.section.events')}</legend>
            <small>{t('webhooks.field.eventsHelp')}</small>
            {initial.events.map((item) => (
              <label key={item.event} style={{ display: 'block' }}>
                <input type="checkbox" checked={draft.events.includes(item.event)} onChange={() => set('events', toggle(draft.events, item.event))} /> {eventLabel(item.event)}{' '}
                <small>({item.fields.join(', ')})</small>
              </label>
            ))}
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('webhooks.section.payload')}</legend>
            <label>
              {t('webhooks.field.template')}
              <textarea value={draft.template} onChange={(ev) => set('template', ev.target.value)} rows={8} maxLength={4096} style={{ fontFamily: 'monospace' }} placeholder={t('webhooks.field.templateDefault')} />
            </label>
            <small>{t('webhooks.field.templateHelp', { tags: initial.limits.mergeTags.join(', ') })}</small>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('webhooks.section.delivery')}</legend>
            <label>
              {t('webhooks.field.rate')}
              <input type="number" min={1} max={initial.limits.maxRate} value={draft.ratePerMinute} onChange={(ev) => set('ratePerMinute', Number(ev.target.value))} required />
            </label>
            <small>{t('webhooks.field.rateHelp', { max: initial.limits.maxRate, attempts: initial.limits.maxAttempts })}</small>
          </fieldset>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy}>
              {busy ? t('webhooks.saving') : t('webhooks.save')}
            </button>
            {draft.id !== null && (
              <button type="button" onClick={rotate}>
                {t('webhooks.secret.rotate')}
              </button>
            )}
            <button type="button" onClick={() => setDraft(null)}>
              {t('webhooks.cancel')}
            </button>
          </div>
        </form>
      )}

      {selected && !draft && (
        <section style={{ display: 'grid', gap: '0.75rem' }}>
          <h2>
            {t('webhooks.deliveries.title')}: {selected.name}
          </h2>
          {deliveries.length === 0 ? (
            <p>{t('webhooks.deliveries.none')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('webhooks.deliveries.columns.when')}</th>
                  <th scope="col">{t('webhooks.deliveries.columns.event')}</th>
                  <th scope="col">{t('webhooks.deliveries.columns.status')}</th>
                  <th scope="col">{t('webhooks.deliveries.columns.attempts')}</th>
                  <th scope="col">{t('webhooks.deliveries.columns.code')}</th>
                  <th scope="col">{t('webhooks.deliveries.columns.error')}</th>
                  <th scope="col">{t('webhooks.deliveries.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>
                      <code>{row.event}</code>
                    </td>
                    <td>{statusLabel(row.status)}</td>
                    <td>{row.attempts}</td>
                    <td>{row.lastStatusCode ?? ''}</td>
                    <td>{row.lastError ?? ''}</td>
                    <td>
                      <button type="button" onClick={() => replay(row, selected)} disabled={row.status === 'pending'}>
                        {t('webhooks.deliveries.replay')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h2>{t('webhooks.docs.title')}</h2>
        <p>{t('webhooks.docs.intro')}</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {DOWNLOADS.map((item) => (
            <a key={item.format} href={`/api/admin-webhooks-docs?format=${item.format}`} download>
              {t(item.labelKey)}
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
