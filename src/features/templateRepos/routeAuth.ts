import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'

export const NO_STORE = { 'Cache-Control': 'no-store' }

/** Template repository routes are for administrators and editors only. Returns a refusal, or null when allowed. */
export async function templateRepoRefusal(): Promise<Response | null> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const roles = (context.user as { roles?: unknown }).roles
  const allowed = context.isAdmin || (Array.isArray(roles) && roles.includes('editor'))
  if (!allowed) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE })
  return null
}
