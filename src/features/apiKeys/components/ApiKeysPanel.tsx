'use client'

import React, { useEffect, useState } from 'react'

import { usePortalText } from '@/features/accounts/components/PortalText'

import { apiKeyScopeChoicesAction, createMyApiKey, revokeApiKeyAction, type ApiKeyView } from '../actions'
import { buildScopes, type ScopeMode } from '../scopePicker'
import type { ScopeCollection } from '../core'
import './apiKeysScopes.css'

/**
 * The API keys list and the create form, for the customer profile and the admin screen.
 * A new key is shown once, with a copy button, and is never shown again: only its hash is
 * stored. Creating a key asks for the password or the six-digit authenticator code first.
 */

const when = (iso: string | null, never: string, unknown: string): string => {
  if (!iso) return never
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? unknown : date.toLocaleDateString()
}

export const ApiKeysPanel: React.FC<{ initial: ApiKeyView[]; showOwner?: boolean; canCreate?: boolean }> = ({ initial, showOwner = false, canCreate = true }) => {
  const [keys, setKeys] = useState<ApiKeyView[]>(initial)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ScopeMode>('read-all')
  const [collections, setCollections] = useState<ScopeCollection[]>([])
  const [picked, setPicked] = useState<Record<string, { read: boolean; write: boolean }>>({})
  const [expiry, setExpiry] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const tx = usePortalText()
  const dateText = (iso: string | null): string => when(iso, tx('panel.never'), tx('panel.unknown'))
  const status = (k: ApiKeyView): string => {
    if (k.revokedAt) return tx('panel.akStatusRevoked')
    if (k.expiresAt && !k.active) return tx('panel.akStatusExpired')
    return k.expiresAt ? tx('panel.akExpires', { date: dateText(k.expiresAt) }) : tx('panel.akNoExpiry')
  }

  useEffect(() => {
    let cancelled = false
    apiKeyScopeChoicesAction()
      .then((list) => {
        if (!cancelled) setCollections(list)
      })
      .catch((): undefined => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const scopes = buildScopes(mode, picked)

  const create = async () => {
    setBusy(true)
    setNotice(null)
    const result = await createMyApiKey({ name, scopes, expiresInDays: expiry, password, code })
    setBusy(false)
    if (result.ok && result.key) {
      setRevealed(result.key)
      if (result.keys) setKeys(result.keys)
      setName('')
      setPassword('')
      setCode('')
      setNotice({ tone: 'ok', text: tx('panel.akCreatedNotice') })
    } else {
      setNotice({ tone: 'error', text: result.error ?? tx('panel.akCreateFailed') })
    }
  }

  const revoke = async (id: number) => {
    setBusy(true)
    const result = await revokeApiKeyAction(id)
    setBusy(false)
    if (result.ok && result.keys) {
      setKeys(result.keys)
      setNotice({ tone: 'ok', text: tx('panel.akRevokedNotice') })
    } else {
      setNotice({ tone: 'error', text: result.error ?? tx('panel.akRevokeFailed') })
    }
  }

  const copy = async () => {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed)
      setNotice({ tone: 'ok', text: tx('panel.copied') })
    } catch {
      setNotice({ tone: 'error', text: tx('panel.copyFailed') })
    }
  }

  return (
    <div className="api-keys-panel">
      {notice && <p className={notice.tone === 'error' ? 'account-note account-note--error' : 'account-note'}>{notice.text}</p>}

      {revealed && (
        <div className="api-keys-reveal">
          <p>{tx('panel.akNewKey')}</p>
          <code style={{ wordBreak: 'break-all' }}>{revealed}</code>
          <div>
            <button type="button" onClick={copy}>{tx('panel.akCopy')}</button>{' '}
            <button type="button" onClick={() => setRevealed(null)}>{tx('panel.akCopied')}</button>
          </div>
        </div>
      )}

      {canCreate && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <h4>{tx('panel.akCreateHeading')}</h4>
          <label>
            {tx('panel.akName')}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <fieldset className="api-scopes">
            <legend>{tx('panel.akScopes')}</legend>
            <label className="api-scopes__mode">
              <input type="radio" name="scope-mode" checked={mode === 'read-all'} onChange={() => setMode('read-all')} /> {tx('panel.akReadAll')} (<code>*:read</code>)
            </label>
            <label className="api-scopes__mode">
              <input type="radio" name="scope-mode" checked={mode === 'all'} onChange={() => setMode('all')} /> {tx('panel.akAll')} (<code>*</code>)
            </label>
            <label className="api-scopes__mode">
              <input type="radio" name="scope-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} /> {tx('panel.akPerCollection')}
            </label>
            {mode === 'custom' && (
              <table className="api-scopes__table">
                <thead>
                  <tr>
                    <th>{tx('panel.akCollection')}</th>
                    <th>{tx('panel.akRead')}</th>
                    <th>{tx('panel.akWrite')}</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((c) => (
                    <tr key={c.slug}>
                      <td>
                        {c.label} <code>{c.slug}</code>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${c.slug}:read`}
                          checked={picked[c.slug]?.read ?? false}
                          onChange={(e) => setPicked({ ...picked, [c.slug]: { read: e.target.checked, write: picked[c.slug]?.write ?? false } })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${c.slug}:write`}
                          checked={picked[c.slug]?.write ?? false}
                          onChange={(e) => setPicked({ ...picked, [c.slug]: { read: picked[c.slug]?.read ?? false, write: e.target.checked } })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="api-scopes__summary">{tx('panel.akSummary', { scopes: scopes.length === 0 ? tx('panel.akNoneChosen') : scopes.join(', ') })}</p>
          </fieldset>
          <label>
            {tx('panel.akExpiry')}
            <input value={expiry} onChange={(e) => setExpiry(e.target.value)} inputMode="numeric" />
          </label>
          <p>{tx('panel.akConfirm')}</p>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            {tx('panel.akOrCode')}
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || scopes.length === 0}>
            {tx('panel.akCreate')}
          </button>
        </form>
      )}

      <h4>{tx('panel.akKeys')}</h4>
      {keys.length === 0 ? (
        <p>{tx('panel.akNone')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              {showOwner && <th>Owner</th>}
              <th>{tx('panel.akName')}</th>
              <th>{tx('panel.akKey')}</th>
              <th>{tx('panel.akScopes')}</th>
              <th>{tx('panel.akColCreated')}</th>
              <th>{tx('panel.akColLastUsed')}</th>
              <th>{tx('panel.akColExpiry')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                {showOwner && <td>{k.ownerEmail ?? `User ${k.userId}`}</td>}
                <td>{k.name}</td>
                <td>
                  <code>{k.prefix}...</code>
                </td>
                <td>{k.scopes.join(', ')}</td>
                <td>{dateText(k.createdAt)}</td>
                <td>{dateText(k.lastUsedAt)}</td>
                <td>{status(k)}</td>
                <td>
                  {k.active && (
                    <button type="button" disabled={busy} onClick={() => void revoke(k.id)}>
                      {tx('panel.revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
