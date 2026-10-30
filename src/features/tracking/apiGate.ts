import 'server-only'

import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'

/**
 * The admin check for the tracking API routes, against the real session on every call. Returns a response to send
 * back when the caller may not act, or null when they may. Never throws.
 */
export async function trackingApiGate(action: 'read' | 'create' | 'update' | 'delete'): Promise<NextResponse | null> {
  const context = await getAdminContext().catch((): null => null)
  if (!context?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!context.isAdmin && !context.can('tracking', action)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
