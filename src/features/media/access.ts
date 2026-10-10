import { NextResponse } from 'next/server'

import { getAdminContext, type AdminContext } from '@/admin/auth'

export type MediaAction = 'read' | 'create' | 'update' | 'delete'

/**
 * Admins, or anyone whose role grants the media action, may use the media
 * admin routes. Everyone else gets a 403 before any work or any key is read.
 */
export async function authorizeMedia(
  action: MediaAction,
): Promise<{ context: AdminContext; response?: undefined } | { context?: undefined; response: Response }> {
  const context = await getAdminContext()
  if (context.isAdmin || context.can('media', action)) return { context }
  return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}

/** Parses a route's `id` query or param into a positive integer, or null. */
export function parseId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
