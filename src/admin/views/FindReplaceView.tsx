import { redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { FIND_REPLACE_COLLECTIONS, type FindReplaceCollection } from '@/features/editScreens/findReplace'
import { FindReplaceClient } from './FindReplaceClient'

const LABELS: Record<FindReplaceCollection, string> = {
  pages: 'Pages',
  posts: 'Blog',
  products: 'Products',
  events: 'Events',
}

/**
 * Server wrapper for the "Find and replace" tool under Settings, Data and System.
 * Anyone who can edit at least one of the searchable places may open it; the
 * places offered are only the ones their role can change.
 */
export async function FindReplaceView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')

  const can = context.can as unknown as (resource: string, action: string) => boolean
  const allowed = FIND_REPLACE_COLLECTIONS.filter((collection) => context.isAdmin || can(collection, 'update'))
  if (allowed.length === 0) redirect('/admin')

  return <FindReplaceClient collections={allowed.map((key) => ({ key, label: LABELS[key] }))} />
}