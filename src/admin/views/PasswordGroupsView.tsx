'use client'

import React, { useCallback, useEffect, useState } from 'react'

/**
 * /admin/password-groups. One shared password per group, which unlocks every
 * protected page, post, product or event that names the group in its
 * Visibility panel. Passwords are write-only: the list shows names and counts.
 */

type Group = { id: number; name: string; updatedAt: string; memberCount: number }

const cardStyle: React.CSSProperties = { maxWidth: 720, padding: '1.5rem' }
const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.9rem',
  marginRight: '8px',
  marginBottom: '8px',
}
const buttonStyle = (tone: 'primary' | 'danger' | 'muted'): React.CSSProperties => ({
  padding: '6px 12px',
  backgroundColor: tone === 'primary' ? '#1976d2' : tone === 'danger' ? '#f44336' : '#eee',
  color: tone === 'muted' ? '#222' : '#fff',
  border: 'none',
  borderRadius: '4px',
  fontSize: '0.9rem',
  cursor: 'pointer',
  marginRight: '6px',
})

export function PasswordGroupsView() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin-password-groups')
      if (!response.ok) throw new Error('Could not load password groups')
      const data = (await response.json()) as { groups: Group[] }
      setGroups(data.groups)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load password groups')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin-password-groups')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load password groups')
        return (await response.json()) as { groups: Group[] }
      })
      .then((data) => {
        if (!cancelled) setGroups(data.groups)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load password groups')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // One request helper so every failure shows the server's own message.
  const send = async (method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<boolean> => {
    setMessage('')
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      setMessage(data.error || 'Something went wrong')
      return false
    }
    await load()
    return true
  }

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    if (await send('POST', '/api/admin-password-groups', { name: newName, password: newPassword })) {
      setNewName('')
      setNewPassword('')
      setMessage('Group created')
    }
  }

  const saveEdit = async (id: number) => {
    const body: { id: number; name?: string; password?: string } = { id }
    if (editName.trim()) body.name = editName
    if (editPassword) body.password = editPassword
    if (await send('PUT', '/api/admin-password-groups', body)) {
      setEditingId(null)
      setEditPassword('')
      setMessage('Group saved. Visitors who unlocked it with the old password will need the new one.')
    }
  }

  const remove = async (group: Group) => {
    if (!window.confirm(`Delete the group "${group.name}"?`)) return
    if (await send('DELETE', `/api/admin-password-groups?id=${group.id}`)) setMessage('Group deleted')
  }

  return (
    <div style={cardStyle}>
      <h1>Shared passwords</h1>
      <p>
        A shared password unlocks every item in its group with one entry. Choose the group in an item&apos;s Visibility panel.
        Each group can protect up to 25 items.
      </p>

      {loadError && <p role="alert">{loadError}</p>}
      {message && <p role="status">{message}</p>}

      <form onSubmit={create} style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem' }}>New group</h2>
        <input
          aria-label="Group name"
          placeholder="Group name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={inputStyle}
        />
        <input
          aria-label="Group password"
          type="password"
          placeholder="Password (min 4 chars)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" disabled={!newName.trim() || newPassword.length < 4} style={buttonStyle('primary')}>
          Create group
        </button>
      </form>

      {groups.length === 0 ? (
        <p>No shared passwords yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Group</th>
              <th align="left">Items</th>
              <th align="left">Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '8px 0' }}>{group.name}</td>
                <td>{group.memberCount}</td>
                <td>{new Date(group.updatedAt).toLocaleDateString()}</td>
                <td align="right">
                  <button type="button" onClick={() => { setEditingId(group.id); setEditName(group.name); setEditPassword('') }} style={buttonStyle('muted')}>
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(group)} style={buttonStyle('danger')}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingId !== null && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem' }}>Edit group</h2>
          <input aria-label="Group name" value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
          <input
            aria-label="New group password"
            type="password"
            placeholder="New password (leave blank to keep)"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            style={inputStyle}
          />
          <button type="button" onClick={() => saveEdit(editingId)} style={buttonStyle('primary')}>
            Save
          </button>
          <button type="button" onClick={() => setEditingId(null)} style={buttonStyle('muted')}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
