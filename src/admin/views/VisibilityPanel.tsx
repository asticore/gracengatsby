'use client'

import React, { useEffect, useState } from 'react'
import { useField } from '@/admin/context'

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

  const isSupported = collectionSlug === 'pages' || collectionSlug === 'posts'
  const isEnabled = membersOnlyValue?.enabled ?? false
  const [visibilityMode, setVisibilityMode] = useState<'public' | 'members-only' | 'password'>('public')
  const [passwordInput, setPasswordInput] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Initialize visibility mode on mount or when id/membersOnly changes
  useEffect(() => {
    const checkPassword = async () => {
      if (!id || !isSupported) return

      try {
        const response = await fetch(`/api/admin-visibility-password?collection=${collectionSlug}&id=${id}`)
        if (!response.ok) throw new Error('Failed to check password')
        const data = (await response.json()) as { hasPassword: boolean }
        setHasPassword(data.hasPassword)

        if (data.hasPassword) {
          setVisibilityMode('password')
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

  const handleVisibilityChange = async (mode: 'public' | 'members-only' | 'password') => {
    setVisibilityMode(mode)
    setPasswordError('')
    setPasswordSuccess(false)

    if (mode === 'password') {
      // Password mode will be set via the password input
      setPasswordInput('')
    } else if (mode === 'members-only') {
      // Set membersOnly in form
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
        onChange={(e) => handleVisibilityChange(e.target.value as 'public' | 'members-only' | 'password')}
        value={visibilityMode}
      >
        <option value="public">Public</option>
        <option value="members-only">Members only</option>
        <option value="password">Password protected</option>
      </select>

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
    </div>
  )
}
