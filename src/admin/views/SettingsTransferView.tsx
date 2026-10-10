import { redirect } from 'next/navigation'
import { getAdminContext } from '@/admin/auth'
import { SettingsTransferClient } from './SettingsTransferClient'

/**
 * Server wrapper for the "Export and import" admin view. Only admins may open
 * it, because exports can contain secrets and user accounts.
 */
export async function SettingsTransferView() {
  const context = await getAdminContext()
  if (!context.isAdmin) {
    redirect('/admin/login')
  }
  return <SettingsTransferClient />
}
