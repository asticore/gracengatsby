'use client'

import React, { useCallback, useState } from 'react'
import { useFormModified } from '@/engine/ui'

/**
 * The "Back up now" and "Restore" controls on the Backups settings screen.
 *
 * Both actions read the SAVED settings, never what is currently typed into the
 * form, so the buttons stay disabled while there are unsaved changes -
 * otherwise a test run would exercise the previous credentials and pass or fail
 * for the wrong reason.
 *
 * Failures are reported in the destination's own words rather than a tidied-up
 * message. "SignatureDoesNotMatch" or "NoSuchBucket" tells an operator what to
 * fix; "backup failed" tells them nothing.
 *
 * The restore side is built around making the destructive step hard to reach by
 * accident: nothing appears until a backup is chosen, the check runs first and
 * reports what is in the way, and the real button stays disabled until the
 * confirmation word is typed exactly and the overwrite box is ticked.
 */

type RunResult = {
  ok?: boolean
  id?: string
  status?: string
  bytes?: number
  error?: string
  prefix?: string
  pruned?: string[]
}

type Manifest = {
  createdAt?: string
  contents?: { database?: boolean; media?: boolean; settings?: boolean }
  tables?: Record<string, number>
  media?: { objects?: number }
}

type Catalogued = { id: string; bytes: number; objects: number; manifest: Manifest | null }

type RestoreResult = {
  ok?: boolean
  error?: string
  warnings?: string[]
  occupied?: Record<string, number>
  mediaObjectsPresent?: number
  restored?: { tables?: Record<string, number>; mediaObjects?: number }
  confirmationWord?: string
}

const CONFIRMATION = 'RESTORE'

const formatBytes = (bytes: number | undefined): string => {
  if (!bytes || bytes < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const note = (ok: boolean): React.CSSProperties => ({
  margin: '10px 0 0',
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  color: ok ? '#1a7f37' : '#b3261e',
})

export const BackupPanel: React.FC = () => {
  const modified = useFormModified()

  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)

  const [backups, setBackups] = useState<Catalogued[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)

  const [chosen, setChosen] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const response = await fetch('/api/internal-backup-list', { credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; backups?: Catalogued[]; error?: string }
      if (body.ok) setBackups(body.backups ?? [])
      else setListError(body.error || 'The destination could not be read.')
    } catch (error) {
      setListError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingList(false)
    }
  }, [])

  const backUpNow = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const response = await fetch('/api/internal-backup-run', { method: 'POST', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as RunResult
      setRunResult(
        response.ok
          ? body
          : { ok: false, error: body.error || 'The run could not start. Are you still signed in as an admin?' },
      )
      await loadList()
    } catch (error) {
      setRunResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setRunning(false)
    }
  }

  const callRestore = async (dryRun: boolean) => {
    setRestoring(true)
    setRestoreResult(null)
    try {
      const response = await fetch('/api/internal-backup-restore', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          backupId: chosen,
          confirm: dryRun ? CONFIRMATION : confirmText,
          overwrite,
          dryRun,
        }),
      })
      setRestoreResult((await response.json().catch(() => ({}))) as RestoreResult)
    } catch (error) {
      setRestoreResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setRestoring(false)
    }
  }

  const canRestore = chosen !== '' && confirmText === CONFIRMATION && overwrite && !restoring && !modified

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <button
        type="button"
        onClick={backUpNow}
        disabled={running || modified}
        className="btn btn--style-primary"
        style={{ margin: 0 }}
      >
        {running ? 'Backing up…' : 'Back up now'}
      </button>

      {modified && (
        <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.75 }}>
          Save your changes first - a backup uses the saved settings.
        </p>
      )}

      {runResult && (
        <p style={note(Boolean(runResult.ok))}>
          {runResult.ok
            ? `Backed up ${formatBytes(runResult.bytes)} to ${runResult.prefix ?? 'the destination'}.` +
              (runResult.status === 'partial' ? `\nSome files were left out: ${runResult.error}` : '') +
              (runResult.pruned?.length ? `\nRemoved ${runResult.pruned.length} older backup(s).` : '')
            : `Not backed up: ${runResult.error ?? 'the destination gave no reason.'}`}
        </p>
      )}

      <hr style={{ margin: '24px 0 16px', opacity: 0.2 }} />

      <h4 style={{ margin: '0 0 4px' }}>Restore</h4>
      <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
        Restoring replaces the live site with the contents of a backup. Run the check first - it reports
        exactly what would be replaced without changing anything.
      </p>

      {backups === null && (
        // Loaded on request rather than on render. Opening this screen should
        // not cost a round trip to the destination for the many visits that are
        // only here to change a setting.
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={loadingList || modified}
          className="btn btn--style-secondary"
          style={{ margin: '0 0 8px' }}
        >
          {loadingList ? 'Reading the destination…' : 'Show backups at the destination'}
        </button>
      )}

      {listError && <p style={note(false)}>{listError}</p>}

      {backups && backups.length === 0 && !listError && (
        <p style={{ fontSize: 13, opacity: 0.75 }}>There are no backups at the destination yet.</p>
      )}

      {backups && backups.length > 0 && (
        <>
          <select
            value={chosen}
            onChange={(event) => {
              setChosen(event.target.value)
              setRestoreResult(null)
              setConfirmText('')
              setOverwrite(false)
            }}
            style={{ maxWidth: 520, width: '100%', padding: 8 }}
          >
            <option value="">Choose a backup…</option>
            {backups.map((backup) => (
              <option key={backup.id} value={backup.id}>
                {backup.id} - {formatBytes(backup.bytes)}, {backup.objects} file(s)
                {backup.manifest ? '' : ' - no manifest, cannot be restored'}
              </option>
            ))}
          </select>

          {chosen && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => callRestore(true)}
                disabled={restoring}
                className="btn btn--style-secondary"
                style={{ margin: '0 8px 0 0' }}
              >
                {restoring ? 'Checking…' : 'Check this backup'}
              </button>

              <label style={{ display: 'block', margin: '14px 0 6px', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                  style={{ marginRight: 8 }}
                />
                I understand this replaces the data that is on the site now.
              </label>

              <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
                Type <strong>{CONFIRMATION}</strong> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={CONFIRMATION}
                style={{ padding: 8, width: 200, marginRight: 8 }}
              />

              <button
                type="button"
                onClick={() => callRestore(false)}
                disabled={!canRestore}
                className="btn btn--style-secondary"
                style={{ margin: 0 }}
              >
                {restoring ? 'Restoring…' : 'Restore this backup'}
              </button>
            </div>
          )}
        </>
      )}

      {restoreResult && (
        <p style={note(Boolean(restoreResult.ok))}>
          {restoreResult.error
            ? restoreResult.error
            : restoreResult.restored
              ? `Restored ${Object.keys(restoreResult.restored.tables ?? {}).length} table(s) and ` +
                `${restoreResult.restored.mediaObjects ?? 0} media file(s).`
              : 'Checked.'}
          {restoreResult.occupied && Object.keys(restoreResult.occupied).length > 0
            ? `\nAlready holding data: ${Object.entries(restoreResult.occupied)
                .slice(0, 8)
                .map(([table, rows]) => `${table} (${rows})`)
                .join(', ')}${Object.keys(restoreResult.occupied).length > 8 ? ', …' : ''}`
            : ''}
          {restoreResult.warnings?.length ? `\n${restoreResult.warnings.join('\n')}` : ''}
        </p>
      )}
    </div>
  )
}

export default BackupPanel
