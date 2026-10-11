'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo } from '@/engine/ui'

import { parseLocks, serializeLocks, type LockMode } from '@/features/roles/locks'
import { can } from '@/features/roles/permissions'

/**
 * Lock / unlock a whole template or page from its edit screen. Shows the lock to everyone; the select
 * is only enabled for admins and holders of the "locks" permission (or roles named on the lock).
 * Section-level locks are set in the visual editor. The server enforces all of it (lockGuard).
 */
export const DocumentLockControl: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [mode, setMode] = useState<LockMode | 'none'>('none')
  const [roles, setRoles] = useState('')
  const [allowed, setAllowed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !collectionSlug) return
    Promise.all([
      fetch(`/api/${collectionSlug}/${id}?depth=0`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/users/me', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([doc, me]: any[]) => {
        const locks = parseLocks(doc?.locks)
        setMode(locks.document?.mode ?? 'none')
        setRoles((locks.document?.unlockRoles ?? []).join(', '))
        const user = me?.user
        setAllowed(Boolean(user && (user.roles?.includes('admin') || can(user, 'locks', 'update'))))
      })
      .catch(() => {})
  }, [id, collectionSlug])

  if (!id || !collectionSlug) return null

  const save = async (nextMode: LockMode | 'none', nextRoles: string) => {
    const current = await fetch(`/api/${collectionSlug}/${id}?depth=0`, { credentials: 'include' }).then((r) => r.json() as Promise<any>)
    const locks = parseLocks(current.locks)
    if (nextMode === 'none') delete locks.document
    else locks.document = { mode: nextMode, unlockRoles: nextRoles.split(',').map((r) => r.trim()).filter(Boolean), editableProps: locks.document?.editableProps ?? [] }
    const res = await fetch(`/api/${collectionSlug}/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locks: serializeLocks(locks) }),
    })
    setMessage(res.ok ? 'Saved.' : 'Could not change the lock.')
    if (res.ok) setMode(nextMode)
  }

  return (
    <div style={{ padding: '0 32px', marginBottom: 8, fontSize: 13 }} data-testid="document-lock">
      <span aria-hidden="true">{mode === 'none' ? '🔓' : '🔒'}</span>{' '}
      <label>
        Lock{' '}
        <select value={mode} disabled={!allowed} onChange={(e) => save(e.target.value as LockMode | 'none', roles)}>
          <option value="none">Unlocked</option>
          <option value="structure">Structure fixed, text editable</option>
          <option value="full">Fully locked</option>
        </select>
      </label>{' '}
      {mode !== 'none' && (
        <label>
          Roles that may unlock{' '}
          <input value={roles} disabled={!allowed} onChange={(e) => setRoles(e.target.value)} onBlur={() => save(mode, roles)} placeholder="editor, brand-team" />
        </label>
      )}{' '}
      {!allowed && <em>Only admins and roles with lock rights can change this.</em>} {message}
    </div>
  )
}

export default DocumentLockControl
