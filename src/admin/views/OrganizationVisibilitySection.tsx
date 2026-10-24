'use client'

import React, { useEffect, useState } from 'react'

type Payload = { enabled: boolean; organizationId: string | null; organizations: { id: string; name: string }[] } | null

/**
 * The "Visible to members of organisation X" control under the Visibility
 * selector. Independent of the password and members-only modes: it talks only
 * to /api/admin-visibility-org and renders nothing until organisations exist
 * or are switched on.
 */
export const OrganizationVisibilitySection: React.FC<{ collectionSlug: string; id?: number; readOnly?: boolean }> = ({ collectionSlug, id, readOnly = false }) => {
  const [enabled, setEnabled] = useState(false)
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`/api/admin-visibility-org?collection=${encodeURIComponent(collectionSlug)}&id=${id}`)
      .then((response): Promise<Payload> | null => (response.ok ? (response.json() as Promise<Payload>) : null))
      .then((data) => {
        if (cancelled || !data) return
        setEnabled(Boolean(data.enabled))
        setOrganizations(data.organizations ?? [])
        setOrganizationId(data.organizationId ?? '')
      })
      .catch((): void => undefined)
    return (): void => {
      cancelled = true
    }
  }, [collectionSlug, id])

  if (!id || !enabled) return null

  const change = async (next: string) => {
    setBusy(true)
    setError('')
    try {
      const response = next
        ? await fetch('/api/admin-visibility-org', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collection: collectionSlug, id, organizationId: next }) })
        : await fetch(`/api/admin-visibility-org?collection=${encodeURIComponent(collectionSlug)}&id=${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not save')
      setOrganizationId(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="doc-visibility__org" style={{ marginTop: '12px' }}>
      <label className="doc-visibility__label" htmlFor="doc-visibility-org">
        Organisation access
      </label>
      <select id="doc-visibility-org" className="doc-visibility__select" disabled={readOnly || busy} value={organizationId} onChange={(e) => void change(e.target.value)}>
        <option value="">Not limited to an organisation</option>
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            Visible to members of {org.name}
          </option>
        ))}
      </select>
      {error ? <div role="alert" style={{ marginTop: '6px', color: '#c62828', fontSize: '0.85rem' }}>{error}</div> : null}
    </div>
  )
}
