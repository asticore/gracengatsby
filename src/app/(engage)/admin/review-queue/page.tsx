import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { ReviewQueueView } from '@/features/approval/views/ReviewQueueView'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = { title: 'Review queue - Admin' }

/** Static admin screen, so it sits beside the catch-all admin route rather than inside the custom view registry. */
export default async function ReviewQueuePage() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  return <ReviewQueueView />
}