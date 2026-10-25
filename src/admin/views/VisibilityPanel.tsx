'use client'

import React, { useEffect, useState } from 'react'
import { useField } from '@/admin/context'
import { OrganizationVisibilitySection } from './OrganizationVisibilitySection'

import './visibility-access.css'

type VisibilityMode = 'public' | 'members-only' | 'password' | 'group' | 'accounts'
type GroupOption = { id: number; name: string; expired: boolean }

export const VisibilityPanel: React.FC<{
  collectionSlug: string
  id?: number
  readOnly?: boolean
}> = ({ collectionSlug, id, readOnly = false }) => {
  const { value: membersOnlyValue, setValue: setMembersOnly } = useField<{
    enabled?: boolean
    tier?: unknown
  }>({
    path: 'membersOnly',
  })

  const isSupported = collectionSlug === 'pages' || collectionSlug === 'posts' || collectionSlug === 'products' || collectionSlug === 'events'
  const isEnabled = membersOnlyValue?.enabled ?? false
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>('public')
  const [passwordInput, setPasswordInput] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [hasRule, setHasRule] = useState(false)
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [groupId, setGroupId] = useState('')
  const [rolesInput, setRolesInput] = useState('')
  const [tiersInput, setTiersInput] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessMessage, setAccessMessage] = useState('')
  const [accessError, setAccessError] = useState('')

  // Initialize visibility mode on mount or when id/membersOnly changes
  useEffect(() => {
    const checkPassword = async () => {
      if (!id || !isSupported) return

      try {
        const response = await fetch(`/api/admin-visibility-password?collection=${collectionSlug}&id=${id}`)
        if (!response.ok) throw new Error('Failed to check password')
        const data = (await response.json()) as { hasPassword: boolean }
        setHasPassword(data.hasPassword)

        let rule: { mode?: 'group' | 'accounts' | null; groupId?: number | null; roles?: string[]; tiers?: string[] } = {}
        try {
          const ruleResponse = await fetch(`/api/admin-visibility-access?collection=${collectionSlug}&id=${id}`)
          if (ruleResponse.ok) rule = (await ruleResponse.json()) as typeof rule
        } catch {
          // The rule lookup is optional for the panel; the password state above still applies.
        }
        setHasRule(Boolean(rule.mode))
        setGroupId(rule.groupId ? String(rule.groupId) : '')
        setRolesInput((rule.roles ?? []).join(', '))
        setTiersInput((rule.tiers ?? []).join(', '))
        try {
          const groupResponse = await fetch('/api/admin-password-groups')
          if (groupResponse.ok) setGroups(((await groupResponse.json()) as { groups: GroupOption[] }).groups)
        } catch {
          // No group list: the group choices stay empty.
        }

        if (data.hasPassword) {
          setVisibilityMode('password')
        } else if (rule.mode === 'group') {
          setVisibilityMode('group')
        } else if (rule.mode === 'accounts') {
          setVisibilityMode('accounts')
        } else if (isEnabled) {
          setVisibilityMode('members-only')
        } else {
          setVisibilityMode('public')
        }
      } catch (error) {
        console.error('Error checking password:', error)
      }
    }

    checkPassword()
  }, [id, collectionSlug, isEnabled])

  const clearRule = async () => {
    if (!hasRule || !id) return
    try {
      const response = await fetch(`/api/admin-visibility-access?collection=${collectionSlug}&id=${id}`, { method: 'DELETE' })
      if (response.ok) setHasRule(false)
    } catch (error) {
      console.error('Error clearing access rule:', error)
    }
  }

  const splitList = (value: string): string[] =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

  const handleSaveAccess = async (mode: 'group' | 'accounts') => {
    if (!id) {
      setAccessError('Save the document first')
      return
    }
    setAccessBusy(true)
    setAccessError('')
    setAccessMessage('')
    try {
      const response = await fetch('/api/admin-visibility-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: collectionSlug,
          id,
          mode,
          groupId: groupId ? Number(groupId) : null,
          roles: mode === 'accounts' ? splitList(rolesInput) : [],
          tiers: mode === 'accounts' ? splitList(tiersInput) : [],
        }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Failed to save')
      }
      setHasRule(true)
      setHasPassword(false)
      setMembersOnly({ enabled: false, tier: membersOnlyValue?.tier ?? null })
      setAccessMessage('Saved')
      setTimeout(() => setAccessMessage(''), 3000)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setAccessBusy(false)
    }
  }

  const handleVisibilityChange = async (mode: VisibilityMode) => {
    setVisibilityMode(mode)
    setPasswordError('')
    setPasswordSuccess(false)
    setAccessError('')
    setAccessMessage('')

    if (mode === 'group' || mode === 'accounts') {
      // Nothing is protected until Save is pressed in the choices below.
    } else if (mode === 'password') {
      // Password mode will be set via the password input
      setPasswordInput('')
    } else if (mode === 'members-only') {
      // Set membersOnly in form
      void clearRule()
      setMembersOnly({
        enabled: true,
        tier: membersOnlyValue?.tier ?? null,
      })
      // If there was a password, we need to clear it
      if (hasPassword && id) {
        try {
          const response = await fetch(`/api/admin-visibility-password?collection=${collectionSlug}&id=${id}`, {
            method: 'DELETE',
          })
          if (response.ok) {
            setHasPassword(false)
            setPasswordSuccess(true)
            setTimeout(() => setPasswordSuccess(false), 3000)
          }
        } catch (error) {
          console.error('Error clearing password:', error)
        }
      }
    } else {
      // Public mode
      void clearRule()
      setMembersOnly({
        enabled: false,
        tier: membersOnlyValue?.tier ?? null,
      })
      // If there was a password, we need to clear it
      if (hasPassword && id) {
        try {
          const response = await fetch(`/api/admin-visibility-password?collection=${collectionSlug}&id=${id}`, {
            method: 'DELETE',
          })
          if (response.ok) {
            setHasPassword(false)
            setPasswordSuccess(true)
            setTimeout(() => setPasswordSuccess(false), 3000)
          }
        } catch (error) {
          console.error('Error clearing password:', error)
        }
      }
    }
  }

  const handleSetPassword = async () => {
    if (!passwordInput.trim()) {
      setPasswordError('Password cannot be empty')
      return
    }
    if (passwordInput.length < 4) {
      setPasswordError('Password must be at least 4 characters')
      return
    }
    if (!id) {
      setPasswordError('Save the document first')
      return
    }

    setPasswordLoading(true)
    setPasswordError('')

    try {
      const response = await fetch('/api/admin-visibility-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: collectionSlug,
          id,
          password: passwordInput,
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || 'Failed to set password')
      }

      setHasPassword(true)
      void clearRule()
      setPasswordInput('')
      setPasswordSuccess(true)
      setVisibilityMode('password')
      // Make sure membersOnly is not enabled
      setMembersOnly({
        enabled: false,
        tier: membersOnlyValue?.tier ?? null,
      })

      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleRemovePassword = async () => {
    if (!id) return
    if (!window.confirm('Remove password protection? This content will become public.')) {
      return
    }

    setPasswordLoading(true)

    try {
      const response = await fetch(`/api/admin-visibility-password?collection=${collectionSlug}&id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to remove password')

      setHasPassword(false)
      setPasswordSuccess(true)
      setVisibilityMode('public')
      setMembersOnly({
        enabled: false,
        tier: membersOnlyValue?.tier ?? null,
      })

      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!isSupported) return null

  return (
    <div className="doc-visibility">
      <label className="doc-visibility__label">Visibility</label>

      <select
        className="doc-visibility__select"
        disabled={readOnly}
        onChange={(e) => handleVisibilityChange(e.target.value as VisibilityMode)}
        value={visibilityMode}
      >
        <option value="public">Public</option>
        <option value="members-only">Members only</option>
        <option value="password">Password protected</option>
        <option value="group">Use a shared password group</option>
        <option value="accounts">Visible to signed-in accounts</option>
      </select>

      {visibilityMode === 'group' && (
        <div className="doc-visibility__access">
          <label className="doc-visibility__access-label">
            Password group
            <select
              className="doc-visibility__access-input"
              disabled={readOnly || accessBusy}
              onChange={(e) => setGroupId(e.target.value)}
              value={groupId}
            >
              <option value="">Choose a group</option>
              {groups.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                  {g.expired ? ' (expired)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="doc-visibility__access-hint">
            One password unlocks every document in the group. Create and rotate groups under Settings, Security, Password groups.
          </p>
          <button
            className="doc-visibility__access-button"
            disabled={!groupId || !id || accessBusy || readOnly}
            onClick={() => handleSaveAccess('group')}
            type="button"
          >
            {accessBusy ? 'Saving...' : 'Use this group'}
          </button>
          {!id && <p className="doc-visibility__access-hint">Save the document first</p>}
          {accessMessage && <div className="doc-visibility__access-ok">{accessMessage}</div>}
          {accessError && <div className="doc-visibility__access-error">{accessError}</div>}
        </div>
      )}

      {visibilityMode === 'accounts' && (
        <div className="doc-visibility__access">
          <label className="doc-visibility__access-label">
            Allowed roles (optional, comma separated)
            <input
              className="doc-visibility__access-input"
              disabled={readOnly || accessBusy}
              onChange={(e) => setRolesInput(e.target.value)}
              placeholder="customer, editor"
              value={rolesInput}
            />
          </label>
          <label className="doc-visibility__access-label">
            Allowed membership tiers (optional, comma separated tier names)
            <input
              className="doc-visibility__access-input"
              disabled={readOnly || accessBusy}
              onChange={(e) => setTiersInput(e.target.value)}
              placeholder="gold, silver"
              value={tiersInput}
            />
          </label>
          <p className="doc-visibility__access-hint">
            Leave both empty to allow any signed-in account. A role or a tier match is enough. Everyone else sees a gate with a sign-in link.
          </p>
          <label className="doc-visibility__access-label">
            Also allow a password group (optional)
            <select
              className="doc-visibility__access-input"
              disabled={readOnly || accessBusy}
              onChange={(e) => setGroupId(e.target.value)}
              value={groupId}
            >
              <option value="">No password alternative</option>
              {groups.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                  {g.expired ? ' (expired)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            className="doc-visibility__access-button"
            disabled={!id || accessBusy || readOnly}
            onClick={() => handleSaveAccess('accounts')}
            type="button"
          >
            {accessBusy ? 'Saving...' : 'Save'}
          </button>
          {!id && <p className="doc-visibility__access-hint">Save the document first</p>}
          {accessMessage && <div className="doc-visibility__access-ok">{accessMessage}</div>}
          {accessError && <div className="doc-visibility__access-error">{accessError}</div>}
        </div>
      )}

      {visibilityMode === 'password' && (
        <div style={{ marginTop: '12px' }}>
          {hasPassword ? (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#e8f5e9',
                  color: '#2e7d32',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  marginBottom: '8px',
                }}
              >
                Password set
              </div>
              <button
                type="button"
                onClick={handleRemovePassword}
                disabled={passwordLoading || readOnly}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  cursor: passwordLoading || readOnly ? 'not-allowed' : 'pointer',
                  opacity: passwordLoading || readOnly ? 0.6 : 1,
                }}
              >
                {passwordLoading ? 'Removing...' : 'Remove password'}
              </button>
            </div>
          ) : (
            <>
              <input
                type="password"
                placeholder="Enter new password (min 4 chars)"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={passwordLoading || readOnly}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  marginBottom: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={!passwordInput || passwordLoading || !id || readOnly}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#1976d2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  cursor: !passwordInput || passwordLoading || !id || readOnly ? 'not-allowed' : 'pointer',
                  opacity: !passwordInput || passwordLoading || !id || readOnly ? 0.6 : 1,
                }}
              >
                {passwordLoading ? 'Setting...' : 'Set password'}
              </button>
              {!id && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '0.85rem',
                    color: '#666',
                  }}
                >
                  Save the document first
                </div>
              )}
            </>
          )}

          {passwordError && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                backgroundColor: '#ffebee',
                color: '#c62828',
                borderRadius: '4px',
                fontSize: '0.9rem',
              }}
            >
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                backgroundColor: '#e8f5e9',
                color: '#2e7d32',
                borderRadius: '4px',
                fontSize: '0.9rem',
              }}
            >
              {hasPassword ? 'Password removed' : 'Password set successfully'}
            </div>
          )}
        </div>
      )}
      <OrganizationVisibilitySection collectionSlug={collectionSlug} id={id} readOnly={readOnly} />
    </div>
  )
}
