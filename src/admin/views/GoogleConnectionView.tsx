import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { readGoogleConnection } from '@/features/google/auth'
import { redirectUriFor } from '@/features/google/constants'
import { publicOrigin } from '@/features/google/origin'
import { GoogleConnectionClient } from './GoogleConnectionClient'

/**
 * Server wrapper for /admin/google-connection. Administrators only. Reads the
 * non-secret connection fields and hands them to the screen; no secret leaves
 * the server.
 */
export async function GoogleConnectionView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!context.isAdmin) redirect('/admin')

  const status = await readGoogleConnection(context.engine)
  const incoming = await headers()
  const host = incoming.get('host')
  const proto = incoming.get('x-forwarded-proto') || 'https'
  const origin = publicOrigin(host ? `${proto}://${host}/` : undefined)
  return <GoogleConnectionClient status={status} redirectUri={redirectUriFor(origin)} />
}
