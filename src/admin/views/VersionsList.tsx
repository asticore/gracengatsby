'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveName } from './authorName'

interface Version {
  id: number
  parent: number
  version: Record<string, unknown> & { _status?: string; updatedAt?: string }
  createdAt: string
  updatedAt: string
  latest: boolean
}

interface VersionsResponse {
  docs: Version[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
}

const formatDateTime = (date: string): string => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(date))
  } catch {
    return date
  }
}

const getChangedFields = (version: Record<string, unknown>, currentDoc: Record<string, unknown>, titleField: string): string[] => {
  const ignored = new Set(['id', 'createdAt', 'updatedAt', '_status'])
  const changed: string[] = []

  for (const key of Object.keys(version)) {
    if (ignored.has(key) || key === titleField) continue
    const versionVal = JSON.stringify(version[key])
    const currentVal = JSON.stringify(currentDoc[key])
    if (versionVal !== currentVal) {
      changed.push(key)
    }
  }

  return changed
}

export function VersionsList({
  collectionSlug,
  id,
  currentDoc,
  titleField,
}: {
  collectionSlug: string
  id: number
  currentDoc: Record<string, unknown>
  titleField: string
}) {
  const router = useRouter()
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<'draft' | 'publish' | null>(null)

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const query = new URLSearchParams({
        'where[parent][equals]': String(id),
        limit: '50',
        'sort': '-updatedAt',
        'depth': '1',
      })
      const response = await fetch(`/api/${collectionSlug}/versions?${query}`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: VersionsResponse = await response.json()
      setVersions(data.docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }, [id, collectionSlug])

  // Fetch on mount
  useEffect(() => {
    // Loads the list from the REST API; the state it sets is the result of that request, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVersions()
  }, [fetchVersions])

  const handleRestore = useCallback(
    async (versionId: number, draft: boolean) => {
      setBusy(versionId)
      setError(null)
      try {
        const query = new URLSearchParams()
        if (draft) query.set('draft', 'true')
        const response = await fetch(`/api/${collectionSlug}/versions/${versionId}?${query}`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => ({ errors: [] as Array<{ message?: string }> }))) as {
            errors?: Array<{ message?: string }>
          }
          const message = body.errors?.[0]?.message || `HTTP ${response.status}`
          setError(message)
          return
        }
        router.push(`/admin/collections/${collectionSlug}/${id}`)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Restore failed')
      } finally {
        setBusy(null)
        setConfirming(null)
        setConfirmAction(null)
      }
    },
    [id, collectionSlug, router]
  )

  const openConfirm = useCallback((versionId: number, action: 'draft' | 'publish') => {
    setConfirming(versionId)
    setConfirmAction(action)
  }, [])

  const cancelConfirm = useCallback(() => {
    setConfirming(null)
    setConfirmAction(null)
  }, [])

  if (loading) return <p>Loading versions...</p>
  if (error) return <p style={{ color: 'var(--theme-error)' }}>{error}</p>
  if (versions.length === 0) return <p>No saved versions yet.</p>

  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            <th>Saved</th>
            <th>Status</th>
            <th>Author</th>
            <th>Title</th>
            <th>Changes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const changed = getChangedFields(version.version, currentDoc, titleField)
            const changedText =
              changed.length === 0
                ? 'Same as current'
                : changed.length <= 4
                  ? changed.join(', ')
                  : `${changed.slice(0, 4).join(', ')} +${changed.length - 4} more`

            const isConfirmingThis = confirming === version.id
            const isPublished = version.version._status === 'published'

            return (
              <tr key={version.id} className={version.latest ? 'opacity-60' : ''}>
                <td>{formatDateTime(version.version.updatedAt || version.updatedAt)}</td>
                <td>
                  <span
                    className={isPublished ? 'pill pill--accent' : 'pill'}
                    style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}
                  >
                    {version.version._status || 'unknown'}
                    {version.latest && ' (Latest)'}
                  </span>
                </td>
                <td>{resolveName((version.version as Record<string, unknown>).updatedBy)}</td>
                <td>{String(version.version[titleField] || `(${version.id})`)}</td>
                <td>{changedText}</td>
                <td>
                  {isConfirmingThis ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn--small"
                        onClick={() => handleRestore(version.id, confirmAction === 'draft')}
                        disabled={busy !== null}
                      >
                        Yes
                      </button>
                      <button className="btn btn--small btn--secondary" onClick={cancelConfirm} disabled={busy !== null}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn--small"
                        onClick={() => openConfirm(version.id, 'draft')}
                        disabled={busy !== null}
                      >
                        Restore as draft
                      </button>
                      <button
                        className="btn btn--small btn--accent"
                        onClick={() => openConfirm(version.id, 'publish')}
                        disabled={busy !== null}
                      >
                        Restore and publish
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
