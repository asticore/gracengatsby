import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { readGoogleConnection } from '@/features/google/auth'
import { connectRedirectUri } from '@/features/tracking/connect/constants'
import { redirectUriFor } from '@/features/google/constants'
import { publicOrigin } from '@/features/google/origin'
import { readConnectionDoc } from '@/features/tracking/connect/store'
import { toTrackingConnectionStatus } from '@/features/tracking/connect/status'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'

import { TrackingConnectionsClient } from './TrackingConnectionsClient'

/**
 * Server wrapper for /admin/tracking-connections. Admins and users with the
 * tracking permission may open it. Secrets never leave the server: the client
 * gets only the non-secret status and the redirect addresses.
 */
export async function TrackingConnectionsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const canOpen = context.isAdmin || context.can('tracking', 'update')
  if (!canOpen) redirect(adminHref('', await getAdminRoot()))

  const engine = context.engine
  const connections = await readConnectionDoc(engine)
  const integrations = (await engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
  const status = toTrackingConnectionStatus(connections, integrations)
  const google = await readGoogleConnection(engine)

  const incoming = await headers()
  const host = incoming.get('host')
  const proto = incoming.get('x-forwarded-proto') || 'https'
  const origin = publicOrigin(host ? `${proto}://${host}/` : undefined)

  return (
    <TrackingConnectionsClient
      status={status}
      google={google}
      isAdmin={context.isAdmin}
      redirectUris={{
        meta: connectRedirectUri(origin, 'meta'),
        tiktok: connectRedirectUri(origin, 'tiktok'),
        google: redirectUriFor(origin),
      }}
    />
  )
}
