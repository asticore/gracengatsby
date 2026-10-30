'use client'

import React, { useMemo, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { ApiKeysPanel } from '@/features/apiKeys/components/ApiKeysPanel'
import {
  createTryItKeyAction,
  deleteEndpointAction,
  recentCallsAction,
  regenerateDocsTokenAction,
  revokeTryItKeyAction,
  saveEndpointAction,
  setEnabledAction,
  setPublicDocsAction,
  type BuilderData,
} from '../actions'
import { FILTER_OPERATORS, endpointPath, type ApiEndpoint, type ApiEndpointConfig, type FilterOperator, type RequiredRole } from '../core'
import type { CallLogEntry } from '../store'
import type { CollectionChoice } from '../admin'

/**
 * The API builder screen: the list of endpoints, the editor, Try it, the call log and the key
 * list. Every write goes through a server action that re-checks the session and the `api`
 * permission. Nothing here stores a key: a key made for Try it is shown once and revoked after the call.
 */

type Draft = Omit<ApiEndpointConfig, 'allowedKeyIds'> & { allowedKeyIds: number[] | null; id: number | null }

const blankDraft = (choices: CollectionChoice[]): Draft => {
  const first = choices[0]
  const fields = first ? first.fields.slice(0, 3).map((f) => f.key) : []
  return {
    id: null,
    name: '',
    description: '',
    version: 'v1',
    slug: '',
    collection: first?.slug ?? '',
    fields,
    filters: [],
    sortable: [],
    defaultSort: null,
    defaultLimit: 20,
    maxLimit: 100,
    allowCreate: false,
    allowUpdate: false,
    requiredRole: 'staff',
    allowedKeyIds: null,
    rateLimitPerMinute: 60,
    enabled: true,
    responseFormat: 'envelope',
  }
}

const draftFrom = (e: ApiEndpoint): Draft => ({
  id: e.id,
  name: e.name,
  description: e.description,
  version: e.version,
  slug: e.slug,
  collection: e.collection,
  fields: e.fields,
  filters: e.filters,
  sortable: e.sortable,
  defaultSort: e.defaultSort,
  defaultLimit: e.defaultLimit,
  maxLimit: e.maxLimit,
  allowCreate: e.allowCreate,
  allowUpdate: e.allowUpdate,
  requiredRole: e.requiredRole,
  allowedKeyIds: e.allowedKeyIds,
  rateLimitPerMinute: e.rateLimitPerMinute,
  enabled: e.enabled,
  responseFormat: e.responseFormat,
})

const GUIDE_DOWNLOADS: Array<{ format: string; label: 'apiBuilder.guide.format.openapiJson' | 'apiBuilder.guide.format.openapiYaml' | 'apiBuilder.guide.format.markdown' | 'apiBuilder.guide.format.html' | 'apiBuilder.guide.format.postman' }> = [
  { format: 'openapi.json', label: 'apiBuilder.guide.format.openapiJson' },
  { format: 'openapi.yaml', label: 'apiBuilder.guide.format.openapiYaml' },
  { format: 'guide.md', label: 'apiBuilder.guide.format.markdown' },
  { format: 'guide.html', label: 'apiBuilder.guide.format.html' },
  { format: 'postman.json', label: 'apiBuilder.guide.format.postman' },
]

const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

export const ApiBuilderPanel: React.FC<{ initial: BuilderData }> = ({ initial }) => {
  const t = useAdminT()
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(initial.endpoints)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [calls, setCalls] = useState<CallLogEntry[]>([])
  const [publicOn, setPublicOn] = useState(initial.publicDocs.enabled)
  const [publicPath, setPublicPath] = useState<string | null>(initial.publicDocs.path)
  const [copied, setCopied] = useState(false)

  const choice = useMemo(() => initial.choices.find((c) => c.slug === draft?.collection) ?? null, [initial.choices, draft?.collection])
  const keyOptions = initial.keys.filter((k) => !k.revokedAt)

  const openNew = () => {
    setNotice(null)
    setDraft(blankDraft(initial.choices))
  }
  const openEdit = (e: ApiEndpoint) => {
    setNotice(null)
    setDraft(draftFrom(e))
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setNotice(null)
    const { id, ...input } = draft
    const result = await saveEndpointAction(id, input)
    setBusy(false)
    if (result.ok === false) {
      setNotice({ tone: 'error', text: result.error })
      return
    }
    const saved = result.value!
    setEndpoints((list) => (id === null ? [...list, saved].sort((a, b) => a.name.localeCompare(b.name)) : list.map((x) => (x.id === saved.id ? saved : x))))
    setDraft(null)
    setNotice({ tone: 'ok', text: t('apiBuilder.saved') })
  }

  const remove = async (e: ApiEndpoint) => {
    if (!window.confirm(t('apiBuilder.deleteConfirm'))) return
    const result = await deleteEndpointAction(e.id)
    if (result.ok === false) {
      setNotice({ tone: 'error', text: result.error })
      return
    }
    setEndpoints((list) => list.filter((x) => x.id !== e.id))
    if (selectedId === e.id) setSelectedId(null)
    setNotice({ tone: 'ok', text: t('apiBuilder.deleted') })
  }

  const flip = async (e: ApiEndpoint) => {
    const result = await setEnabledAction(e.id, !e.enabled)
    if (result.ok === false) {
      setNotice({ tone: 'error', text: result.error })
      return
    }
    setEndpoints((list) => list.map((x) => (x.id === e.id ? result.value! : x)))
  }

  const showCalls = async (e: ApiEndpoint) => {
    setSelectedId(e.id)
    const result = await recentCallsAction(e.id)
    setCalls(result.ok ? (result.value ?? []) : [])
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const selected = endpoints.find((e) => e.id === selectedId) ?? null

  return (
    <div style={{ maxWidth: 1040, padding: '1.5rem', display: 'grid', gap: '1.5rem' }}>
      <p>{t('apiBuilder.intro')}</p>
      {!initial.keysEnabled && <p role="status">{t('apiBuilder.keysOff')}</p>}
      {notice && (
        <p role="status" style={{ color: notice.tone === 'error' ? 'var(--color-danger, #b00020)' : 'inherit' }}>
          {notice.text}
        </p>
      )}

      {!draft && (
        <section style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <button type="button" onClick={openNew} disabled={initial.choices.length === 0}>
              {t('apiBuilder.new')}
            </button>
          </div>
          {endpoints.length === 0 ? (
            <p>{t('apiBuilder.none')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('apiBuilder.columns.name')}</th>
                  <th scope="col">{t('apiBuilder.columns.path')}</th>
                  <th scope="col">{t('apiBuilder.columns.collection')}</th>
                  <th scope="col">{t('apiBuilder.columns.enabled')}</th>
                  <th scope="col">{t('apiBuilder.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>
                      <code>{endpointPath(e.version, e.slug)}</code>
                    </td>
                    <td>{initial.choices.find((c) => c.slug === e.collection)?.label ?? e.collection}</td>
                    <td>
                      <input type="checkbox" checked={e.enabled} onChange={() => flip(e)} aria-label={t('apiBuilder.enabledLabel')} />
                    </td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => openEdit(e)}>
                        {t('apiBuilder.edit')}
                      </button>
                      <button type="button" onClick={() => showCalls(e)}>
                        {t('apiBuilder.calls')}
                      </button>
                      <button type="button" onClick={() => remove(e)}>
                        {t('apiBuilder.delete')}
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
            <legend>{t('apiBuilder.section.basics')}</legend>
            <label>
              {t('apiBuilder.field.name')}
              <input value={draft.name} onChange={(ev) => set('name', ev.target.value)} maxLength={80} required />
            </label>
            <label>
              {t('apiBuilder.field.description')}
              <input value={draft.description} onChange={(ev) => set('description', ev.target.value)} maxLength={500} />
            </label>
            <label>
              {t('apiBuilder.field.version')}
              <input value={draft.version} onChange={(ev) => set('version', ev.target.value)} maxLength={4} required />
            </label>
            <label>
              {t('apiBuilder.field.path')}
              <input value={draft.slug} onChange={(ev) => set('slug', ev.target.value)} maxLength={48} required />
            </label>
            <small>{t('apiBuilder.field.pathHelp')}</small>
            <small>
              {t('apiBuilder.field.url')}: <code>{endpointPath(draft.version || 'v1', draft.slug || 'name')}</code>
            </small>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.source')}</legend>
            <label>
              {t('apiBuilder.field.collection')}
              <select value={draft.collection} onChange={(ev) => setDraft((d) => (d ? { ...d, collection: ev.target.value, fields: [], filters: [], sortable: [], defaultSort: null } : d))}>
                {initial.choices.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>{t('apiBuilder.field.fields')}</legend>
              <small>{t('apiBuilder.field.fieldsHelp')}</small>
              {(choice?.fields ?? []).map((f) => (
                <label key={f.key} style={{ display: 'block' }}>
                  <input type="checkbox" checked={draft.fields.includes(f.key)} onChange={() => set('fields', toggle(draft.fields, f.key))} /> {f.label}
                </label>
              ))}
            </fieldset>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.filters')}</legend>
            <small>{t('apiBuilder.field.filtersHelp')}</small>
            {draft.fields.map((key) => {
              const current = draft.filters.find((f) => f.field === key)
              const ops = current?.operators ?? []
              return (
                <div key={key} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <strong>{choice?.fields.find((f) => f.key === key)?.label ?? key}</strong>
                  {FILTER_OPERATORS.map((op) => (
                    <label key={op}>
                      <input
                        type="checkbox"
                        checked={ops.includes(op)}
                        onChange={() => {
                          const next = toggle<FilterOperator>(ops, op)
                          const others = draft.filters.filter((f) => f.field !== key)
                          set('filters', next.length ? [...others, { field: key, operators: next }] : others)
                        }}
                      />{' '}
                      {t(`apiBuilder.op.${op}` as never)}
                    </label>
                  ))}
                </div>
              )
            })}
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.sort')}</legend>
            <fieldset>
              <legend>{t('apiBuilder.field.sortable')}</legend>
              {draft.fields.map((key) => (
                <label key={key} style={{ display: 'block' }}>
                  <input type="checkbox" checked={draft.sortable.includes(key)} onChange={() => set('sortable', toggle(draft.sortable, key))} />{' '}
                  {choice?.fields.find((f) => f.key === key)?.label ?? key}
                </label>
              ))}
            </fieldset>
            <label>
              {t('apiBuilder.field.defaultSort')}
              <select value={draft.defaultSort ?? ''} onChange={(ev) => set('defaultSort', ev.target.value || null)}>
                <option value="">{t('apiBuilder.field.defaultSortNone')}</option>
                {draft.sortable.flatMap((key) => [
                  <option key={`a-${key}`} value={key}>
                    {key} ↑
                  </option>,
                  <option key={`d-${key}`} value={`-${key}`}>
                    {key} ↓
                  </option>,
                ])}
              </select>
            </label>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.paging')}</legend>
            <label>
              {t('apiBuilder.field.defaultLimit')}
              <input type="number" min={1} max={100} value={draft.defaultLimit} onChange={(ev) => set('defaultLimit', Number(ev.target.value))} />
            </label>
            <label>
              {t('apiBuilder.field.maxLimit')}
              <input type="number" min={1} max={100} value={draft.maxLimit} onChange={(ev) => set('maxLimit', Number(ev.target.value))} />
            </label>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.methods')}</legend>
            <label>
              <input type="checkbox" checked={draft.allowCreate} onChange={(ev) => set('allowCreate', ev.target.checked)} /> {t('apiBuilder.field.allowCreate')}
            </label>
            <label>
              <input type="checkbox" checked={draft.allowUpdate} onChange={(ev) => set('allowUpdate', ev.target.checked)} /> {t('apiBuilder.field.allowUpdate')}
            </label>
            <small>{t('apiBuilder.field.deleteNever')}</small>
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.access')}</legend>
            <label>
              {t('apiBuilder.field.requiredRole')}
              <select value={draft.requiredRole} onChange={(ev) => set('requiredRole', ev.target.value as RequiredRole)}>
                <option value="any">{t('apiBuilder.role.any')}</option>
                <option value="staff">{t('apiBuilder.role.staff')}</option>
                <option value="editor">{t('apiBuilder.role.editor')}</option>
                <option value="admin">{t('apiBuilder.role.admin')}</option>
              </select>
            </label>
            <label>
              <input type="radio" name="keys-mode" checked={draft.allowedKeyIds === null} onChange={() => set('allowedKeyIds', null)} /> {t('apiBuilder.field.allKeys')}
            </label>
            <label>
              <input
                type="radio"
                name="keys-mode"
                checked={draft.allowedKeyIds !== null}
                onChange={() => set('allowedKeyIds', draft.allowedKeyIds ?? [])}
              />{' '}
              {t('apiBuilder.field.someKeys')}
            </label>
            {draft.allowedKeyIds !== null &&
              (keyOptions.length === 0 ? (
                <small>{t('apiBuilder.field.keysNone')}</small>
              ) : (
                keyOptions.map((k) => (
                  <label key={k.id} style={{ display: 'block', marginLeft: '1.5rem' }}>
                    <input type="checkbox" checked={draft.allowedKeyIds!.includes(k.id)} onChange={() => set('allowedKeyIds', toggle(draft.allowedKeyIds ?? [], k.id))} />{' '}
                    {k.name} ({k.prefix}…) {k.ownerEmail ?? ''}
                  </label>
                ))
              ))}
          </fieldset>

          <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
            <legend>{t('apiBuilder.section.limits')}</legend>
            <label>
              {t('apiBuilder.field.rate')}
              <input type="number" min={1} max={600} value={draft.rateLimitPerMinute} onChange={(ev) => set('rateLimitPerMinute', Number(ev.target.value))} />
            </label>
            <label>
              {t('apiBuilder.field.format')}
              <select value={draft.responseFormat} onChange={(ev) => set('responseFormat', ev.target.value as ApiEndpointConfig['responseFormat'])}>
                <option value="envelope">{t('apiBuilder.format.envelope')}</option>
                <option value="array">{t('apiBuilder.format.array')}</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={draft.enabled} onChange={(ev) => set('enabled', ev.target.checked)} /> {t('apiBuilder.enabledLabel')}
            </label>
          </fieldset>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy}>
              {busy ? t('apiBuilder.saving') : t('apiBuilder.save')}
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={busy}>
              {t('apiBuilder.cancel')}
            </button>
          </div>
        </form>
      )}

      {draft?.id && <TryIt endpoint={endpoints.find((e) => e.id === draft.id) ?? null} />}

      {selected && (
        <section style={{ display: 'grid', gap: '0.5rem' }}>
          <h2>{t('apiBuilder.calls')}</h2>
          {calls.length === 0 ? (
            <p>{t('apiBuilder.callsNone')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('apiBuilder.call.when')}</th>
                  <th scope="col">{t('apiBuilder.call.method')}</th>
                  <th scope="col">{t('apiBuilder.call.status')}</th>
                  <th scope="col">{t('apiBuilder.call.key')}</th>
                  <th scope="col">{t('apiBuilder.call.user')}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c, i) => (
                  <tr key={`${c.createdAt}-${i}`}>
                    <td>{new Date(c.createdAt).toLocaleString()}</td>
                    <td>{c.method}</td>
                    <td>{c.status}</td>
                    <td>{c.keyId ?? '-'}</td>
                    <td>{c.userId ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h2>{t('apiBuilder.guide.title')}</h2>
        <p>{t('apiBuilder.guide.intro')}</p>
        <ul>
          {GUIDE_DOWNLOADS.map((g) => (
            <li key={g.format}>
              <a href={`/api/admin-api-builder-docs?format=${g.format}`} download>
                {t(g.label)}
              </a>
            </li>
          ))}
        </ul>
        <label>
          <input
            type="checkbox"
            checked={publicOn}
            onChange={async (ev) => {
              const result = await setPublicDocsAction(ev.target.checked)
              if (result.ok === false) {
                setNotice({ tone: 'error', text: result.error })
                return
              }
              setPublicOn(ev.target.checked)
              setPublicPath(result.value?.path ?? null)
            }}
          />{' '}
          {t('apiBuilder.guide.publicToggle')}
        </label>
        <small>{t('apiBuilder.guide.publicHelp')}</small>
        {publicOn && publicPath && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input readOnly value={`${window.location.origin}${publicPath}`} onFocus={(ev) => ev.target.select()} aria-label={t('apiBuilder.guide.publicToggle')} style={{ minWidth: 320 }} />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`).catch((): undefined => undefined)
                setCopied(true)
              }}
            >
              {copied ? t('apiBuilder.guide.copied') : t('apiBuilder.guide.copy')}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(t('apiBuilder.guide.regenerateConfirm'))) return
                const result = await regenerateDocsTokenAction()
                if (result.ok === false) {
                  setNotice({ tone: 'error', text: result.error })
                  return
                }
                setPublicPath(result.value!.path)
                setCopied(false)
              }}
            >
              {t('apiBuilder.guide.regenerate')}
            </button>
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h2>{t('apiBuilder.keys.title')}</h2>
        <p>{t('apiBuilder.keys.intro')}</p>
        <ApiKeysPanel initial={initial.keys} showOwner />
      </section>
    </div>
  )
}

/**
 * Try it: calls the endpoint from the admin with a key. The key is either pasted (kept in this
 * page's memory only) or a one-time test key, made for this call and revoked straight after.
 */
const TryIt: React.FC<{ endpoint: ApiEndpoint | null }> = ({ endpoint }) => {
  const t = useAdminT()
  const [pasted, setPasted] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST' | 'PATCH'>('GET')
  const [query, setQuery] = useState('')
  const [recordId, setRecordId] = useState('')
  const [body, setBody] = useState('{}')
  const [output, setOutput] = useState<{ status: number; text: string; retry: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!endpoint) return null
  const path = endpointPath(endpoint.version, endpoint.slug) + (recordId.trim() ? `/${encodeURIComponent(recordId.trim())}` : '')

  const send = async (key: string) => {
    const url = `${path}${query ? `?${query.replace(/^\?/, '')}` : ''}`
    const init: RequestInit = { method, headers: { Authorization: `Bearer ${key}` } }
    if (method !== 'GET') {
      init.body = body
      ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
    }
    const response = await fetch(url, init)
    const text = await response.text()
    let pretty = text
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      // not JSON: show as is
    }
    setOutput({ status: response.status, text: pretty, retry: response.headers.get('Retry-After') })
  }

  const run = async (useTest: boolean) => {
    setBusy(true)
    setError(null)
    setOutput(null)
    try {
      if (useTest) {
        const made = await createTryItKeyAction(endpoint.id)
        if (made.ok === false) {
          setError(made.error)
          return
        }
        try {
          await send(made.value!.key)
        } finally {
          await revokeTryItKeyAction(made.value!.keyId)
        }
      } else {
        if (!pasted.trim()) {
          setError(t('apiBuilder.tryIt.noKey'))
          return
        }
        await send(pasted.trim())
      }
    } catch {
      setError(t('apiBuilder.tryIt.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ display: 'grid', gap: '0.75rem' }}>
      <h2>{t('apiBuilder.tryIt.title')}</h2>
      <p>{t('apiBuilder.tryIt.intro')}</p>
      <label>
        {t('apiBuilder.tryIt.key')}
        <input type="password" autoComplete="off" value={pasted} onChange={(ev) => setPasted(ev.target.value)} placeholder="egk_..." />
      </label>
      <small>{t('apiBuilder.tryIt.keyHelp')}</small>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label>
          {t('apiBuilder.tryIt.method')}
          <select value={method} onChange={(ev) => setMethod(ev.target.value as 'GET' | 'POST' | 'PATCH')}>
            <option value="GET">GET</option>
            {endpoint.allowCreate && <option value="POST">POST</option>}
            {endpoint.allowUpdate && <option value="PATCH">PATCH</option>}
          </select>
        </label>
        <label>
          {t('apiBuilder.tryIt.query')}
          <input value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="limit=5&sort=-price" />
        </label>
        {method !== 'POST' && (
          <label>
            {t('apiBuilder.tryIt.recordId')}
            <input value={recordId} onChange={(ev) => setRecordId(ev.target.value)} inputMode="numeric" />
          </label>
        )}
      </div>
      {method !== 'GET' && (
        <label>
          {t('apiBuilder.tryIt.body')}
          <textarea rows={5} value={body} onChange={(ev) => setBody(ev.target.value)} />
        </label>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={() => run(false)} disabled={busy}>
          {busy ? t('apiBuilder.tryIt.sending') : t('apiBuilder.tryIt.send')}
        </button>
        <button type="button" onClick={() => run(true)} disabled={busy}>
          {t('apiBuilder.tryIt.useTest')}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {output && (
        <div>
          <p>{t('apiBuilder.tryIt.status', { code: output.status })}</p>
          {output.retry && <p>{t('apiBuilder.tryIt.retry', { seconds: output.retry })}</p>}
          <pre style={{ overflow: 'auto', maxHeight: 360 }}>{output.text}</pre>
        </div>
      )}
    </section>
  )
}
