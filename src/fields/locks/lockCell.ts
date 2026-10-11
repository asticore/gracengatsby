import { hasAnyLock, parseLocks } from '@/features/roles/locks'

/** List cell for the `locks` field: a lock icon with what is locked. */
export function formatLockCell(value: unknown): string {
  const locks = parseLocks(value)
  if (locks.document) return locks.document.mode === 'full' ? '🔒 Fully locked' : '🔒 Text only'
  const n = Object.keys(locks.nodes).length
  return hasAnyLock(locks) ? `🔒 ${n} locked section${n === 1 ? '' : 's'}` : ''
}
