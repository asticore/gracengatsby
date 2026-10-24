'use client'

import React, { useState } from 'react'

import { createMyApiKey, revokeApiKeyAction, type ApiKeyView } from '../actions'

/**
 * The API keys list and the create form, for the customer profile and the admin screen.
 * A new key is shown once, with a copy button, and is never shown again: only its hash is
 * stored. Creating a key asks for the password or the six-digit authenticator code first.
 */

const when = (iso: string | null): string => {
  if (!iso) return 'Never'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString()
}

const status = (k: ApiKeyView): string => {
  if (k.revokedAt) return 'Revoked'
  if (k.expiresAt && !k.active) return 'Expired'
  return k.expiresAt ? `Expires ${when(k.expiresAt)}` : 'No expiry'
}

export const ApiKeysPanel: React.FC<{ initial: ApiKeyView[]; showOwner?: boolean; canCreate?: boolean }> = ({ initial, showOwner = false, canCreate = true }) => {
  const [keys, setKeys] = useState<ApiKeyView[]>(initial)
  const [name, setName] = useState('')
  const [read, setRead] = useState(true)
  const [write, setWrite] = useState(false)
  const [expiry, setExpiry] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    const scopes = [read ? 'read' : null, write ? 'write' : null].filter((s): s is string => Boolean(s))
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
      setNotice({ tone: 'ok', text: 'Key created. Copy it now: it will not be shown again.' })
    } else {
      setNotice({ tone: 'error', text: result.error ?? 'The key could not be created.' })
    }
  }

  const revoke = async (id: number) => {
    setBusy(true)
    const result = await revokeApiKeyAction(id)
    setBusy(false)
    if (result.ok && result.keys) {
      setKeys(result.keys)
      setNotice({ tone: 'ok', text: 'Key revoked. It stops working immediately.' })
    } else {
      setNotice({ tone: 'error', text: result.error ?? 'The key could not be revoked.' })
    }
  }

  const copy = async () => {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed)
      setNotice({ tone: 'ok', text: 'Copied.' })
    } catch {
      setNotice({ tone: 'error', text: 'Copy did not work. Select the key and copy it by hand.' })
    }
  }

  return (
    <div className="api-keys-panel">
      {notice && <p className={notice.tone === 'error' ? 'account-note account-note--error' : 'account-note'}>{notice.text}</p>}

      {revealed && (
        <div className="api-keys-reveal">
          <p>Your new key</p>
          <code style={{ wordBreak: 'break-all' }}>{revealed}</code>
          <div>
            <button type="button" onClick={copy}>Copy key</button>{' '}
            <button type="button" onClick={() => setRevealed(null)}>I have copied it</button>
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
          <h4>Create a key</h4>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <fieldset>
            <legend>Scopes</legend>
            <label>
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> Read
            </label>{' '}
            <label>
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> Write (create and update)
            </label>
          </fieldset>
          <label>
            Expires after (days, leave empty for the site maximum)
            <input value={expiry} onChange={(e) => setExpiry(e.target.value)} inputMode="numeric" />
          </label>
          <p>Confirm it is you:</p>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Or a six-digit code
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || (!read && !write)}>
            Create key
          </button>
        </form>
      )}

      <h4>Keys</h4>
      {keys.length === 0 ? (
        <p>No API keys yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {showOwner && <th>Owner</th>}
              <th>Name</th>
              <th>Key</th>
              <th>Scopes</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Expiry</th>
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
                <td>{when(k.createdAt)}</td>
                <td>{when(k.lastUsedAt)}</td>
                <td>{status(k)}</td>
                <td>
                  {k.active && (
                    <button type="button" disabled={busy} onClick={() => void revoke(k.id)}>
                      Revoke
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
