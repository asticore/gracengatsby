import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { privacyBinding } from '@/features/privacy/binding'
import { currentCustomerForExport } from '@/features/privacy/customerActions'
import { exportCustomerData } from '@/features/privacy/export'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

/**
 * GET /account/privacy/export: the signed-in customer's data as a JSON file. Only the session's own
 * customer, never a record chosen by the URL. Refused while an admin is viewing the account.
 */
export async function GET() {
  const who = await currentCustomerForExport()
  if (who.blocked) return NextResponse.json({ error: 'Not available.' }, { status: 404, headers: NO_STORE })
  if (!who.user) return NextResponse.json({ error: 'Sign in to download your data.' }, { status: 401, headers: NO_STORE })

  const user = who.user as unknown as { id: number; email: string } & Record<string, unknown>
  const { d1 } = await privacyBinding()
  const doc = await exportCustomerData(who.engine, d1, user, new Date())

  try {
    const engine = await getEngine()
    const settings = await getSecuritySettings(engine as never)
    const seen = auditContext(new Request('https://engage.local', { headers: await headers() }))
    await audit({ action: 'privacy.export', actorId: Number(user.id), actorEmail: String(user.email), collectionSlug: 'users', documentId: Number(user.id), detail: 'customer downloaded their data', ip: seen.ip, userAgent: seen.userAgent } as never, settings)
  } catch {
    // A log line never fails the download.
  }

  const day = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-data-${day}.json"`,
    },
  })
}
