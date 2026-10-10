/**
 * Client store for the collapsed/expanded state of edit-screen option cards.
 *
 * One module-level store shared by every card on the page. State is the set of
 * closed card ids; anything not in the set is open. On first subscribe the
 * store fetches the user's saved set from /api/admin-edit-prefs, and every
 * change is saved back after a short debounce.
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

export type CardOp = { type: 'set'; ids: string[]; closed: boolean } | { type: 'clear' }

/** Keeps the first MAX_IDS unique strings that match ID_PATTERN. */
export function sanitizeCardIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  for (const id of input.slice(0, MAX_IDS)) {
    if (typeof id === 'string' && ID_PATTERN.test(id)) seen.add(id)
  }
  return [...seen]
}

/** Pure reducer over the closed-id set. */
export function applyCardOp(closed: ReadonlySet<string>, op: CardOp): ReadonlySet<string> {
  if (op.type === 'clear') return new Set<string>()
  const next = new Set(closed)
  for (const id of op.ids) {
    if (op.closed) next.add(id)
    else next.delete(id)
  }
  return next
}

const EMPTY: ReadonlySet<string> = new Set<string>()

let closed: ReadonlySet<string> = EMPTY
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
  closed = next
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

/** Writes the current closed set now. Queued behind any save already in flight. */
function persistNow(keepalive: boolean): void {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (loadState !== 'ready') return
  const body = JSON.stringify({ closed: sanitizeCardIds([...closed]) })
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
        const body = (await response.json()) as { closed?: unknown }
        let next: ReadonlySet<string> = new Set(sanitizeCardIds(body.closed))
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
  commit(applyCardOp(closed, op))
  scheduleSave()
}

/** Registers a card id so collapseAll() with no arguments covers it. */
export function registerCardId(id: string): void {
  knownIds.add(id)
}

/** Sets one card open or closed. */
export function setCardOpen(id: string, open: boolean): void {
  if (closed.has(id) === !open) return
  dispatch({ type: 'set', ids: [id], closed: !open })
}

/** Closes the given cards, or every registered card when no ids are given. */
export function collapseAll(ids?: string[]): void {
  const targets = ids ?? [...knownIds]
  if (targets.length === 0) return
  dispatch({ type: 'set', ids: targets, closed: true })
}

/** Opens every card. */
export function expandAll(): void {
  dispatch({ type: 'clear' })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  ensureLoaded()
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ReadonlySet<string> {
  return closed
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY
}

/**
 * Open state for one card: `[open, toggle]`. Cards default to open.
 * The id is registered once mounted so collapseAll() covers it.
 */
export function useCardOpen(id: string): [open: boolean, toggle: () => void] {
  const closedSet = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  useEffect(() => {
    registerCardId(id)
  }, [id])
  const open = !closedSet.has(id)
  const toggle = () => setCardOpen(id, !closed.has(id))
  return [open, toggle]
}
