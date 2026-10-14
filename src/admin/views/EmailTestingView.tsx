import { redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { readEmailTestingSettings } from '@/features/email/connectionRead'
import { EmailTestingClient } from './EmailTestingClient'

/**
 * Server wrapper for the Email testing screen at /admin/email-testing. Admins
 * only: the screen sends real mail and reads the sending domain's DNS.
 */
export async function EmailTestingView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!context.isAdmin) redirect('/admin')

  const settings = await readEmailTestingSettings(
    context.engine as unknown as Parameters<typeof readEmailTestingSettings>[0],
  )
  const adminEmail =
    typeof (context.user as { email?: unknown } | null)?.email === 'string'
      ? (context.user as { email: string }).email
      : null

  return (
    <EmailTestingClient
      summary={settings.summary}
      smsConnected={settings.smsConnected}
      smsLabel={settings.smsLabel}
      fromEmail={settings.fromEmail}
      testRecipient={settings.testRecipient}
      adminEmail={adminEmail}
    />
  )
}