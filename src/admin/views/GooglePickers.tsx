'use client'

import { useState } from 'react'

import type { PickerKind } from '@/features/google/constants'

import './google-connection.css'

type Item = { value: string; label: string }

type Notice = { tone: 'ok' | 'error'; text: string; notes: string[] }

type Props = {
  kind: PickerKind
  label: string
  help: string
  /** The value already saved, in the same form the list uses. */
  current: string
  /** How the saved value reads in plain English. */
  currentLabel: string
  disabled: boolean
}

/**
 * One dropdown on the Google connection screen: load Google's list, pick one,
 * save it. The server checks the choice against Google before saving.
 */
export function PickerRow({ kind, label, help, current, currentLabel, disabled }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [selected, setSelected] = useState(current)
  const [saved, setSaved] = useState(current)
  const [savedLabel, setSavedLabel] = useState(currentLabel)
  const [busy, setBusy] = useState<'load' | 'save' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const options: Item[] = items ?? []
  const withCurrent = saved && !options.some((item) => item.value === saved) ? [{ value: saved, label: savedLabel }, ...options] : options

  const load = async () => {
    setBusy('load')
    setNotice(null)
    try {
      const response = await fetch(`/api/admin-google-lists?kind=${kind}`, { credentials: 'include' })
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; items?: Item[]; message?: string } | null
      if (response.ok && body?.ok && Array.isArray(body.items)) {
        setItems(body.items)
        if (body.items.length === 0) setNotice({ tone: 'error', text: 'Google listed nothing for this account. Check that it has access to this service.', notes: [] })
      } else {
        setNotice({ tone: 'error', text: body?.message || 'The list could not be loaded. Try again.', notes: [] })
      }
    } catch {
      setNotice({ tone: 'error', text: 'The list could not be loaded. Check the connection and try again.', notes: [] })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!selected) return
    setBusy('save')
    setNotice(null)
    try {
      const response = await fetch('/api/admin-google-picks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value: selected }),
      })
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; message?: string; error?: string; notes?: string[] } | null
      if (response.ok && body?.ok) {
        setSaved(selected)
        setSavedLabel(options.find((item) => item.value === selected)?.label ?? selected)
        setNotice({ tone: 'ok', text: body.message || 'Saved.', notes: Array.isArray(body.notes) ? body.notes : [] })
      } else {
        setNotice({ tone: 'error', text: body?.error || 'The choice could not be saved. Try again.', notes: [] })
      }
    } catch {
      setNotice({ tone: 'error', text: 'The choice could not be saved. Check the connection and try again.', notes: [] })
    } finally {
      setBusy(null)
    }
  }

  const controlsOff = disabled || busy !== null

  return (
    <div className="google-connection__row">
      <p className="google-connection__row-label">
        <strong>{label}</strong>
      </p>
      <p className="google-connection__help">{help}</p>
      <p className="google-connection__current">Saved: {saved ? savedLabel : 'nothing chosen yet'}</p>
      <div className="google-connection__picker">
        <select
          className="google-connection__select"
          aria-label={label}
          value={selected}
          disabled={controlsOff}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{items ? 'Choose one' : 'Load the list first'}</option>
          {withCurrent.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--style-secondary google-connection__button" disabled={controlsOff} onClick={load}>
          {busy === 'load' ? 'Loading...' : 'Load list'}
        </button>
        <button type="button" className="btn btn--style-primary google-connection__button" disabled={controlsOff || !selected || selected === saved} onClick={save}>
          {busy === 'save' ? 'Saving...' : 'Save choice'}
        </button>
      </div>
      {notice && (
        <div role="status" className={`google-connection__notice google-connection__notice--${notice.tone}`}>
          <p>{notice.text}</p>
          {notice.notes.map((note) => (
            <p key={note} className="google-connection__note">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
