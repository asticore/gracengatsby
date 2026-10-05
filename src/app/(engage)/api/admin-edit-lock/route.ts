import { getAdminContext } from '@/admin/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const context = await getAdminContext(request)

  if (!context) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    )
  }

  if (context.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 },
    )
  }

  const data = await request.json()

  return NextResponse.json({
    lock_id: `lock-${Math.random().toString(36).slice(2, 8)}`,
    resource_id: data.resource_id,
    user_id: context.user.id,
    acquired_at: new Date().toISOString(),
  })
}

export async function DELETE(request: NextRequest) {
  const context = await getAdminContext(request)

  if (!context) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const lockId = url.searchParams.get('lock_id')

  if (!lockId) {
    return NextResponse.json(
      { error: 'Missing lock_id' },
      { status: 400 },
    )
  }

  return NextResponse.json({
    success: true,
  })
}
