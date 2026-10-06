import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { purgeCloudflareCache } from '@/features/speed/purge'

export async function POST(_request: NextRequest) {
  try {
    const context = await getAdminContext()

    // Check if user is admin or has settings:integrations update permission
    const isAdmin = context.isAdmin
    const hasPermission = context.can('settings:integrations', 'update')

    if (!isAdmin && !hasPermission) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const result = await purgeCloudflareCache()

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: String(error), ran: false, errors: [String(error)] },
      { status: 500 },
    )
  }
}