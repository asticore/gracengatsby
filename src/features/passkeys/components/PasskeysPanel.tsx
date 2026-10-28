'use client'

import React, { useEffect, useState, useSyncExternalStore } from 'react'

import { usePortalText } from '@/features/accounts/components/PortalText'

import { addPasskey, listPasskeysRequest, passkeysSupported, removePasskeyRequest, renamePasskeyRequest } from '../client'

/**
 * The passkeys list for the customer profile and the admin screen. Adding, renaming and
 * removing each ask for the password or the six-digit authenticator code first; the server
 * checks it again. Shown nowhere when passkeys are off, so existing screens do not change.
 */

export type PasskeyItem = { id: number; deviceLabel: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean }

const when = (iso: string | null, never: string, unknown: string): string => {
  if (!iso) return never
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? unknown : date.toLocaleDateString()
}

const subscribeNever = (): (() => void) => () => undefined

export const PasskeysPanel: React.FC<{ initial: PasskeyItem[] }> = ({ initial }) => {
  const [items, setItems] = useState<PasskeyItem[]>(initial)
  // Server render assumes support; the browser answers for real, without a state update in an effect.
  const supported = useSyncExternalStore(subscribeNever, passkeysSupported, () => true)
  const [confirm, setConfirm] = useState('')
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const tx = usePortalText()
  const dateText = (iso: string | null): string => when(iso, tx('panel.never'), tx('panel.unknown'))

  useEffect(() => {
    listPasskeysRequest().then((result) => {
      if (Array.isArray(result.passkeys)) setItems(result.passkeys as PasskeyItem[])
    })
  }, [])

  const add = async () => {
    setBusy(true)
    setNotice(null)
    const result = await addPasskey(confirm, label.trim())
    setBusy(false)
    if (result.ok && Array.isArray(result.passkeys)) {
      setItems(result.passkeys as PasskeyItem[])
      setLabel('')
      setConfirm('')
      setNotice({ tone: 'ok', text: tx('panel.pkAddedNotice') })
    } else {
      setNotice({ tone: 'error', text: result.message || tx('panel.pkAddFailed') })
    }
  }

  const rename = async (id: number) => {
    const result = await renamePasskeyRequest(id, editLabel.trim())
    if (result.ok) {
      setItems((list) => list.map((item) => (item.id === id ? { ...item, deviceLabel: editLabel.trim() } : item)))
      setEditing(null)
    } else {
      setNotice({ tone: 'error', text: result.message || tx('panel.pkRenameFailed') })
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(tx('panel.pkConfirmRemove'))) return
    setBusy(true)
    const result = await removePasskeyRequest(id, confirm)
    setBusy(false)
    if (result.ok) {
      setItems((list) => list.filter((item) => item.id !== id))
      setNotice({ tone: 'ok', text: tx('panel.pkRemovedNotice') })
    } else {
      setNotice({ tone: 'error', text: result.message || tx('panel.pkRemoveFailed') })
    }
  }

  return (
    <div className="account-passkeys">
      {!supported && <p className="account-hint">{tx('panel.pkUnsupported')}</p>}
      {notice && (
        <p className={`account-note ${notice.tone === 'ok' ? 'account-note--success' : 'account-note--error'}`} role="status">
          {notice.text}
        </p>
      )}
      {items.length === 0 ? (
        <p className="account-hint">{tx('panel.pkNone')}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} style={{ margin: '0.5rem 0' }}>
              {editing === item.id ? (
                <span>
                  <input aria-label={tx('panel.pkNameAria')} value={editLabel} maxLength={60} onChange={(e) => setEditLabel(e.target.value)} />{' '}
                  <button type="button" onClick={() => rename(item.id)}>{tx('panel.pkSaveName')}</button>{' '}
                  <button type="button" onClick={() => setEditing(null)}>{tx('panel.cancel')}</button>
                </span>
              ) : (
                <span>
                  <strong>{item.deviceLabel}</strong>
                  {' '}
                  {tx('panel.pkDetail', { added: dateText(item.createdAt), used: dateText(item.lastUsedAt) })}{' '}
                  <button type="button" onClick={() => { setEditing(item.id); setEditLabel(item.deviceLabel) }}>{tx('panel.rename')}</button>{' '}
                  <button type="button" onClick={() => remove(item.id)} disabled={busy}>{tx('panel.remove')}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {supported && (
        <div className="account-form">
          <label>
            {tx('panel.pkNameLabel')}
            <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={tx('panel.pkNamePlaceholder')} />
          </label>
          <label>
            {tx('panel.pkConfirmLabel')}
            <input type="password" autoComplete="current-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button type="button" className="account-button" onClick={add} disabled={busy}>
            {busy ? tx('common.waitingDevice') : tx('panel.pkAdd')}
          </button>
          <p className="account-hint">{tx('panel.pkHint')}</p>
        </div>
      )}
    </div>
  )
}
