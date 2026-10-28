'use client'

/**
 * Local draft recovery for the admin edit form (mounted once in EditForm).
 *
 * - While the form has changes, a snapshot is kept in this browser about
 *   every 5 seconds (see AUTOSAVE_MS and the rules in
 *   src/features/editScreens/localDraft.ts).
 * - A later visit that finds a draft newer than the server copy shows a
 *   banner with Restore / Discard.
 * - A successful save clears the draft.
 * - Warns before a tab close while there are unsaved changes.
 *
 * All storage access is wrapped in try/catch. When storage is missing, full or
 * blocked, the form simply works without recovery.
 */

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFormFields, useFormModified, useFormSetValues, type FieldsMap } from '@/admin/context'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { AUTOSAVE_MS, draftKey, isNewerThanServer, parseDraft, serialiseDraft, shouldAutosave } from '@/features/editScreens/localDraft'
import './local-draft.css'

// Storage changes made here are announced to React, so the banner re-reads them.
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const notify = () => listeners.forEach((listener) => listener())

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, json: string): boolean {
  try {
    window.localStorage.setItem(key, json)
    notify()
    return true
  } catch {
    // Quota exceeded or storage blocked: skip this snapshot, keep editing.
    return false
  }
}

function removeRaw(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing to remove.
  }
  notify()
}

function siteOrigin(): string {
  try {
    return window.location.origin
  } catch {
    return ''
  }
}

/** The form's current values as a plain path -> value map. */
function plainValues(fields: FieldsMap): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([path, entry]) => [path, entry?.value]))
}

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt)
  return Number.isNaN(date.getTime()) ? 'an earlier visit' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

type Props = {
  collectionSlug?: string
  globalSlug?: string
  id?: number
  /** `updatedAt` of the server copy, or null for a document not yet created. */
  serverUpdatedAt?: string | null
}

export function LocalDraftRecovery({ collectionSlug, globalSlug, id, serverUpdatedAt }: Props) {
  const t = useAdminT()
  // Globals are a single document with no create step; the draft is kept for collections only.
  const enabled = Boolean(collectionSlug) && !globalSlug
  const key = useMemo(() => draftKey(collectionSlug ?? '', id, siteOrigin()), [collectionSlug, id])

  const dirty = useFormModified()
  const fields = useFormFields(([f]) => f)
  const setValues = useFormSetValues()

  // The stored copy as this browser sees it now (null on the server and during hydration).
  const stored = useSyncExternalStore(
    subscribe,
    (): string | null => (enabled ? readRaw(key) : null),
    (): string | null => null,
  )
  // The stored copy the user has already dealt with, or that this tab wrote itself.
  const [settled, setSettled] = useState<string | null>(null)
  const draft = useMemo(() => (stored && stored !== settled ? parseDraft(stored) : null), [stored, settled])
  const offer = draft && isNewerThanServer(draft, serverUpdatedAt) ? draft : null

  // Latest values for the timer, without restarting it on every keystroke.
  const live = useRef({ dirty, enabled, fields, key, pending: false })
  const lastSaved = useRef<number | null>(null)
  useEffect(() => {
    live.current = { dirty, enabled, fields, key, pending: offer !== null }
  })

  // Autosave: checks twice per autosave interval, writes at most once per interval.
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      const state = live.current
      const now = Date.now()
      // While a recovery offer waits for an answer, do not overwrite the draft it is about.
      if (state.pending || !shouldAutosave(state.dirty, lastSaved.current, now, AUTOSAVE_MS)) return
      lastSaved.current = now
      const json = serialiseDraft(plainValues(state.fields), now)
      if (json === null) {
        removeRaw(state.key)
        return
      }
      if (writeRaw(state.key, json)) setSettled(json)
    }, AUTOSAVE_MS / 2)
    return () => window.clearInterval(timer)
  }, [enabled])

  // A save clears the draft: the form went from changed to saved.
  const wasDirty = useRef(dirty)
  useEffect(() => {
    if (enabled && wasDirty.current && !dirty) removeRaw(key)
    wasDirty.current = dirty
  }, [dirty, enabled, key])

  // Warn before a tab close or reload while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (!offer || !stored) return null

  const restore = () => {
    setValues(offer.values)
    setSettled(stored)
  }
  const discard = () => {
    removeRaw(key)
    setSettled(stored)
  }

  return (
    <div className="local-draft-banner" role="status">
      <span>{t('draft.foundUnsaved', { when: formatSavedAt(offer.savedAt) })}</span>
      <span className="local-draft-banner__actions">
        <button className="btn btn--primary" onClick={restore} type="button">
          {t('common.restore')}
        </button>
        <button className="btn" onClick={discard} type="button">
          {t('draft.discard')}
        </button>
      </span>
    </div>
  )
}

export default LocalDraftRecovery
