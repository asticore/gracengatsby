/**
 * Client store for the open/closed state of edit-screen option cards.
 *
 * One module-level store shared by every card on the page. State is the set of
 * OPENED card ids; every card is closed unless its id is in that set. So a
 * card that was never touched starts folded, on every edit screen (collections,
 * the page panel, globals, settings and the home page alike).
 *
 * The server snapshot is always the empty set, so the server render and the
 * first client render agree (all cards closed, no flash of open content). On
 * first subscribe the store fetches the user's saved opened set from
 * /api/admin-edit-prefs, and every change is saved back after a short debounce.
 *
 * Failure behaviour: if the GET fails, cards still toggle locally and nothing
 * is written back (so a transient failure cannot wipe the saved set). The GET
 * is retried on a later subscribe, replaying the changes made in the meantime.
 *
 * Only the pure helpers (sanitizeCardIds, applyCardOp) are exported for tests
 * besides the React hooks and actions.
 */

import { useEffect, useSyncExternalStore } from 'react'

export const CARD_PREFS_ENDPOINT = '/api/admin-edit-prefs'

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,60}$/
const MAX_IDS = 100
const SAVE_DELAY_MS = 400
const RETRY_AFTER_MS = 30_000

export type CardOp = { type: 'set'; ids: string[]; open: boolean } | { type: 'clear' }

/** Keeps the first MAX_IDS unique strings that match ID_PATTERN. */
export function sanitizeCardIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  for (const id of input.slice(0, MAX_IDS)) {
    if (typeof id === 'string' && ID_PATTERN.test(id)) seen.add(id)
  }
  return [...seen]
}

/** Pure reducer over the opened-id set. `clear` closes every card. */
export function applyCardOp(opened: ReadonlySet<string>, op: CardOp): ReadonlySet<string> {
  if (op.type === 'clear') return new Set<string>()
  const next = new Set(opened)
  for (const id of op.ids) {
    if (op.open) next.add(id)
    else next.delete(id)
  }
  return next
}

const EMPTY: ReadonlySet<string> = new Set<string>()

let opened: ReadonlySet<string> = EMPTY
const knownIds = new Set<string>()
const listeners = new Set<() => void>()
/** Ops made before the server state arrived; replayed on top of it. */
let pendingOps: CardOp[] = []
let loadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
let failedAt = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveChain: Promise<void> = Promise.resolve()
let lifecycleBound = false

function emit(): void {
  for (const listener of listeners) listener()
}

function commit(next: ReadonlySet<string>): void {
  opened = next
  emit()
}

async function sendSave(body: string, keepalive: boolean): Promise<void> {
  try {
    await fetch(CARD_PREFS_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive,
    })
  } catch {
    // Save failures are silent; the next change re-sends the whole set.
  }
}

/** Writes the current opened set now. Queued behind any save already in flight. */
function persistNow(keepalive: boolean): void {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (loadState !== 'ready') return
  const body = JSON.stringify({ open: sanitizeCardIds([...opened]) })
  if (keepalive) {
    void sendSave(body, true)
    return
  }
  saveChain = saveChain.then(() => sendSave(body, false))
}

function scheduleSave(): void {
  if (loadState !== 'ready') return
  if (saveTimer !== undefined) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    persistNow(false)
  }, SAVE_DELAY_MS)
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof window === 'undefined') return
  lifecycleBound = true
  // Flush a pending save when the page is being left, so a quick edit is not lost.
  window.addEventListener('pagehide', () => persistNow(true))
}

function ensureLoaded(): void {
  bindLifecycle()
  if (loadState === 'loading' || loadState === 'ready') return
  if (loadState === 'failed' && Date.now() - failedAt < RETRY_AFTER_MS) return

  loadState = 'loading'
  const markFailed = () => {
    loadState = 'failed'
    failedAt = Date.now()
  }

  try {
    fetch(CARD_PREFS_ENDPOINT, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        const body = (await response.json()) as { open?: unknown }
        let next: ReadonlySet<string> = new Set(sanitizeCardIds(body.open))
        for (const op of pendingOps) next = applyCardOp(next, op)
        const hadOps = pendingOps.length > 0
        pendingOps = []
        loadState = 'ready'
        commit(next)
        if (hadOps) scheduleSave()
      })
      .catch(markFailed)
  } catch {
    markFailed()
  }
}

function dispatch(op: CardOp): void {
  if (loadState !== 'ready') pendingOps.push(op)
  commit(applyCardOp(opened, op))
  scheduleSave()
}

/** Registers a card id so collapseAll() / expandAll() with no arguments cover it. */
export function registerCardId(id: string): void {
  knownIds.add(id)
}

/** Opens or closes one card. */
export function setCardOpen(id: string, open: boolean): void {
  if (opened.has(id) === open) return
  dispatch({ type: 'set', ids: [id], open })
}

/** Snapshot of the opened ids (for tests and non-React callers). */
export function getOpenIds(): string[] {
  return [...opened]
}

/** Flips one card: opens it when it is shut, shuts it when it is open. */
export function toggleCard(id: string): void {
  setCardOpen(id, !opened.has(id))
}

/** Closes the given cards, or every registered card when no ids are given. */
export function collapseAll(ids?: string[]): void {
  const targets = ids ?? [...knownIds]
  if (targets.length === 0) return
  dispatch({ type: 'set', ids: targets, open: false })
}

/** Opens every registered card. Cards that were never registered keep their state. */
export function expandAll(): void {
  const targets = [...knownIds]
  if (targets.length === 0) return
  dispatch({ type: 'set', ids: targets, open: true })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  ensureLoaded()
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ReadonlySet<string> {
  return opened
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY
}

/**
 * Open state for one card: `[open, toggle]`. Cards default to CLOSED, both on
 * the server render and until the user's saved set has loaded.
 * The id is registered once mounted so collapseAll() / expandAll() cover it.
 */
export function useCardOpen(id: string): [open: boolean, toggle: () => void] {
  const openedSet = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  useEffect(() => {
    registerCardId(id)
  }, [id])
  const open = openedSet.has(id)
  const toggle = () => toggleCard(id)
  return [open, toggle]
}
