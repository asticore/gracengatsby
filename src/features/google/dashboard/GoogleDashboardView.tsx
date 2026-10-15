import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'

import { GoogleDashboardClient } from './GoogleDashboardClient'

/**
 * Admin screen at /admin/google-dashboard: Search Console, Analytics, PageSpeed and AdSense numbers in
 * one place. Admins only. Each card loads on its own and says why it has no numbers.
 */
export async function GoogleDashboardView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!context.isAdmin) redirect('/admin')
  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1>Google dashboard</h1>
      <p>
        Search, visitors and earnings from the Google account you connected. Numbers are read from Google each time you open this page and kept for five minutes. To connect or change the account, open{' '}
        <Link href="/admin/google-connection">Google connection</Link>.
      </p>
      <GoogleDashboardClient />
    </div>
  )
}
