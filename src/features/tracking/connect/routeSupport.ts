import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { publicOrigin } from '@/features/google/origin'

import { canManageTrackingConnections, canSaveAppSecret, type ConnectionViewer } from './access'
import { TRACKING_CONNECTIONS_PAGE, isConnectProvider, type ConnectProvider } from './constants'
import type { ServiceDeps } from './service'

/** Shared route plumbing: the admin check, the engine, the origin and the JSON answers. Server only. */

export const NO_STORE = { 'Cache-Control': 'no-store' }

export type Gate = { ok: true; deps: ServiceDeps; origin: string; viewer: ConnectionViewer } | { ok: false; response: Response }

/** Resolves the provider from the route segment. Null when it is not one of ours. */
export function providerFrom(raw: string): ConnectProvider | null {
  return isConnectProvider(raw) ? raw : null
}

/** The admin screen URL for a notice, such as "meta-connected". Built with the configured admin root. */
export async function screenUrl(origin: string, notice: string): Promise<string> {
  const root = await getAdminRoot()
  return `${origin}${adminHref(TRACKING_CONNECTIONS_PAGE, root)}?notice=${encodeURIComponent(notice)}`
}

/**
 * Admin (or tracking-permission) check for a JSON route. `needsSecret` marks the
 * one route that saves an app secret, which stays admin-only.
 */
export async function gate(request: NextRequest, options: { needsSecret?: boolean } = {}): Promise<Gate> {
  const context = await getAdminContext()
  const viewer: ConnectionViewer = { user: context.user, isAdmin: context.isAdmin, can: context.can as ConnectionViewer['can'] }
  const allowed = options.needsSecret ? canSaveAppSecret(viewer) : canManageTrackingConnections(viewer)
  if (!allowed) return { ok: false, response: NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403, headers: NO_STORE }) }
  const engine = await getEngine()
  const secret = process.env.ENGAGE_SECRET || ''
  return {
    ok: true,
    origin: publicOrigin(request.url),
    viewer,
    deps: { engine, fetchImpl: (input, init) => fetch(input, init), secret, now: () => Date.now() },
  }
}
