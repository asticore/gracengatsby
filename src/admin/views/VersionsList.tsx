'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveName } from './authorName'
import { useAuthorNames } from './useAuthorNames'
import { diffVersion, type DiffEntry } from './versionDiff'
import { useReviewState } from '@/features/approval/ui/useReviewState'
import { ReviewBox } from '@/features/approval/ui/ReviewPanel'

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
  const [confirmAction, setConfirmAction] = useState<'draft' | 'publish' | 'delete' | null>(null)
  const [expandedCompare, setExpandedCompare] = useState<number | null>(null)
  const [diffs, setDiffs] = useState<Record<number, DiffEntry[]>>({})

  // Collect all updatedBy values from versions for bulk resolution
  const authorIds = versions.map((v) => (v.version as Record<string, unknown>).updatedBy)
  const resolveName_ = useAuthorNames(authorIds)

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/${collectionSlug}/versions?where[parent][equals]=${id}&limit=50&sort=-updatedAt&depth=0`, {
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

  // Declared after the versions fetch so the versions request is still the first one on mount.
  const review = useReviewState(collectionSlug, id, undefined)

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

  const handleDelete = useCallback(
    async (versionId: number) => {
      setBusy(versionId)
      setError(null)
      try {
        const response = await fetch(
          `/api/admin-version-delete?collection=${encodeURIComponent(collectionSlug)}&parent=${id}&id=${versionId}`,
          { method: 'DELETE', credentials: 'include' },
        )
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          setError(body.error || `HTTP ${response.status}`)
          return
        }
        setVersions((prev) => prev.filter((v) => v.id !== versionId))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
      } finally {
        setBusy(null)
        setConfirming(null)
        setConfirmAction(null)
      }
    },
    [id, collectionSlug],
  )

  const openConfirm = useCallback((versionId: number, action: 'draft' | 'publish' | 'delete') => {
    setConfirming(versionId)
    setConfirmAction(action)
  }, [])

  const cancelConfirm = useCallback(() => {
    setConfirming(null)
    setConfirmAction(null)
  }, [])

  const toggleCompare = useCallback((versionId: number) => {
    if (expandedCompare === versionId) {
      setExpandedCompare(null)
    } else {
      setExpandedCompare(versionId)
      // Calculate diff if not already cached
      if (!diffs[versionId]) {
        const version = versions.find((v) => v.id === versionId)
        if (version) {
          const diff = diffVersion(version.version, currentDoc)
          setDiffs((prev) => ({ ...prev, [versionId]: diff }))
        }
      }
    }
  }, [expandedCompare, diffs, versions, currentDoc])

  if (loading) return <p>Loading versions...</p>
  if (versions.length === 0 && !error) return <p>No saved versions yet.</p>

  return (
    <>
      {review.state?.enabled && (
        <section style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>Review history</h3>
          <ReviewBox review={review} />
        </section>
      )}
    <div className="table">
      {error && (
        <p role="alert" style={{ color: 'var(--theme-error-500)', padding: '0.5rem 0.75rem', margin: 0 }}>
          {error}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Saved</th>
            <th>Status</th>
            <th>Author</th>
            <th>Title</th>
            <th>Differs from current</th>
            <th>Actions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {versions.flatMap((version) => {
            const changed = getChangedFields(version.version, currentDoc, titleField)
            const changedText =
              changed.length === 0
                ? 'Same as current'
                : changed.length <= 4
                  ? changed.join(', ')
                  : `${changed.slice(0, 4).join(', ')} +${changed.length - 4} more`

            const isConfirmingThis = confirming === version.id
            const isPublished = version.version._status === 'published'
            const isCompareExpanded = expandedCompare === version.id
            const versionDiffs = diffs[version.id] || []

            const mainRow = (
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
                  <td>{resolveName_((version.version as Record<string, unknown>).updatedBy)}</td>
                  <td>{String(version.version[titleField] || `(${version.id})`)}</td>
                  <td>{changedText}</td>
                  <td>
                    {isConfirmingThis ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn--small"
                          onClick={() =>
                            confirmAction === 'delete' ? handleDelete(version.id) : handleRestore(version.id, confirmAction === 'draft')
                          }
                          disabled={busy !== null}
                        >
                          {confirmAction === 'delete' ? 'Yes, delete' : 'Yes'}
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
                        <button
                          className="btn btn--small"
                          onClick={() => openConfirm(version.id, 'delete')}
                          disabled={busy !== null || version.latest}
                          title={version.latest ? 'The latest version cannot be deleted' : 'Delete this version'}
                          style={{ color: 'var(--theme-error-500)' }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn--small"
                      onClick={() => toggleCompare(version.id)}
                      disabled={busy !== null}
                    >
                      {isCompareExpanded ? 'Hide compare' : 'Compare'}
                    </button>
                  </td>
              </tr>
            )

            const expandRow = isCompareExpanded ? (
              <tr key={`expand-${version.id}`}>
                <td colSpan={7} style={{ padding: '1rem', backgroundColor: 'var(--theme-bg-secondary, #f5f5f5)' }}>
                  {versionDiffs.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--theme-text-secondary)' }}>No differences from the current document.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '0.875rem',
                          backgroundColor: 'var(--theme-bg)',
                        }}
                      >
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Field</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>This version</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Current</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versionDiffs.map((diff) => (
                            <tr key={diff.field} style={{ borderBottom: '1px solid var(--theme-border)' }}>
                              <td style={{ padding: '0.5rem', fontWeight: 500 }}>{diff.label}</td>
                              <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{diff.before}</td>
                              <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{diff.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </td>
              </tr>
            ) : null

            return isCompareExpanded ? [mainRow, expandRow] : [mainRow]
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}
