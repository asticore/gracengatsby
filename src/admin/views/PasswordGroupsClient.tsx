'use client'

import React, { useCallback, useEffect, useState } from 'react'

import './password-groups.css'

type GroupItem = {
  id: number
  name: string
  expiresAt: string | null
  expired: boolean
  maxUses: number | null
  useCount: number
  content: { collection: string; id: number; title: string | null; slug: string | null }[]
}

type Payload = { groups: GroupItem[]; enabled: boolean; isAdmin: boolean }

const LABELS: Record<string, string> = { pages: 'Page', posts: 'Post', products: 'Product', events: 'Event' }

const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : 'never')

export const PasswordGroupsClient: React.FC = () => {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [expires, setExpires] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [rotateId, setRotateId] = useState<number | null>(null)
  const [rotatePassword, setRotatePassword] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-password-groups')
      if (!res.ok) throw new Error('Could not load password groups')
      setData((await res.json()) as Payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load password groups')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const call = async (init: RequestInit, url = '/api/admin-password-groups', ok: string): Promise<boolean> => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(url, init)
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Something went wrong')
      setNotice(ok)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      return false
    } finally {
      setBusy(false)
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const done = await call(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          password,
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          maxUses: maxUses ? Number(maxUses) : null,
        }),
      },
      '/api/admin-password-groups',
      'Group created.',
    )
    if (done) {
      setName('')
      setPassword('')
      setExpires('')
      setMaxUses('')
    }
  }

  const rotate = async (id: number) => {
    const done = await call(
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password: rotatePassword }) },
      '/api/admin-password-groups',
      'Password rotated. Everyone who had unlocked this group must enter the new password.',
    )
    if (done) {
      setRotateId(null)
      setRotatePassword('')
    }
  }

  const remove = async (g: GroupItem) => {
    const inUse = g.content.length
    const message = inUse
      ? `${inUse} item${inUse === 1 ? ' uses' : 's use'} "${g.name}". Deleting it removes the protection from ${inUse === 1 ? 'it' : 'them'}, so ${inUse === 1 ? 'it becomes' : 'they become'} public. Delete anyway?`
      : `Delete the group "${g.name}"?`
    if (!window.confirm(message)) return
    await call({ method: 'DELETE' }, `/api/admin-password-groups?id=${g.id}${inUse ? '&confirm=1' : ''}`, 'Group deleted.')
  }

  const resetUses = (g: GroupItem) =>
    call(
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, resetUses: true }) },
      '/api/admin-password-groups',
      'Use counter reset.',
    )

  const isAdmin = data?.isAdmin ?? false

  return (
    <div className="pwg">
      <p className="pwg__intro">
        A password group is one shared password that can protect many pages, posts, products and events. Unlocking any one of them unlocks them
        all for that visitor. Choose a group in a document&apos;s Visibility panel.
      </p>
      {data && !data.enabled && (
        <div className="pwg__banner" role="status">
          Shared password groups are switched off in Security settings. Every item that uses a group is locked for everyone until you turn them back on.
        </div>
      )}
      {error && (
        <div className="pwg__error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="pwg__ok" role="status">
          {notice}
        </div>
      )}

      {isAdmin && data?.enabled && (
        <form className="pwg__form" onSubmit={create}>
          <label className="pwg__field">
            Name
            <input className="pwg__input" maxLength={80} onChange={(e) => setName(e.target.value)} required value={name} />
          </label>
          <label className="pwg__field">
            Password (6 or more characters)
            <input autoComplete="new-password" className="pwg__input" minLength={6} onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
          </label>
          <label className="pwg__field">
            Expires (optional)
            <input className="pwg__input" onChange={(e) => setExpires(e.target.value)} type="date" value={expires} />
          </label>
          <label className="pwg__field">
            Max unlocks (optional)
            <input className="pwg__input" min={1} onChange={(e) => setMaxUses(e.target.value)} type="number" value={maxUses} />
          </label>
          <div className="pwg__field">
            <span>&nbsp;</span>
            <button className="pwg__button" disabled={busy} type="submit">
              Create group
            </button>
          </div>
        </form>
      )}

      {data && data.groups.length === 0 && <p className="pwg__empty">No password groups yet.</p>}
      <ul className="pwg__list">
        {data?.groups.map((g) => (
          <li className="pwg__card" key={g.id}>
            <div className="pwg__head">
              <h2 className="pwg__name">{g.name}</h2>
              {g.expired && <span className="pwg__badge">Expired</span>}
            </div>
            <p className="pwg__meta">
              Expires: {dateOnly(g.expiresAt)} | Unlocks: {g.useCount}
              {g.maxUses ? ` of ${g.maxUses}` : ''} | Used by {g.content.length} item{g.content.length === 1 ? '' : 's'}
            </p>
            {g.content.length > 0 ? (
              <ul className="pwg__used">
                {g.content.map((c) => (
                  <li key={`${c.collection}-${c.id}`}>
                    {LABELS[c.collection] ?? c.collection}: {c.title ?? `#${c.id}`}
                    {c.slug ? ` (${c.slug})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pwg__empty">Not used by any content yet.</p>
            )}
            {isAdmin && (
              <div className="pwg__actions">
                {rotateId === g.id ? (
                  <>
                    <input
                      aria-label={`New password for ${g.name}`}
                      autoComplete="new-password"
                      className="pwg__input"
                      minLength={6}
                      onChange={(e) => setRotatePassword(e.target.value)}
                      placeholder="New password"
                      type="password"
                      value={rotatePassword}
                    />
                    <button className="pwg__button" disabled={busy || rotatePassword.length < 6} onClick={() => rotate(g.id)} type="button">
                      Save new password
                    </button>
                    <button className="pwg__button pwg__button--quiet" onClick={() => setRotateId(null)} type="button">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="pwg__button" disabled={busy || !data?.enabled} onClick={() => setRotateId(g.id)} type="button">
                      Rotate password
                    </button>
                    {g.maxUses ? (
                      <button className="pwg__button pwg__button--quiet" disabled={busy} onClick={() => resetUses(g)} type="button">
                        Reset unlock count
                      </button>
                    ) : null}
                    <button className="pwg__button pwg__button--danger" disabled={busy} onClick={() => remove(g)} type="button">
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
