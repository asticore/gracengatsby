import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { getDb } from '@/cms/db/connect'
import { readRegistry } from '@/localapi/registry'
import * as editLocks from '@/cms/db/editLocks'

export const dynamic = 'force-dynamic'

/**
 * Admin-only edit lock API.
 * GET ?collection=<slug>&id=<doc_id>: Check lock status without acquiring.
 * POST JSON {collection, id, action: 'acquire'|'heartbeat'|'release'|'takeover'}: Manage locks.
 *
 * Returns {held: boolean, by?: {userId, label}} or {held: true} when caller now holds it.
 */

function isValidCollectionSlug(slug: string): boolean {
  // Valid collection slug: letters, digits, dash
  return /^[a-zA-Z0-9-]+$/.test(slug) && readRegistry.collections[slug] !== undefined
}

function isValidDocId(id: unknown): boolean {
  return Number.isInteger(id) && (id as number) > 0
}

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const url = new URL(request.url)
    const collection = url.searchParams.get('collection') ?? ''
    const id = Number(url.searchParams.get('id'))

    if (!isValidCollectionSlug(collection) || !isValidDocId(id)) {
      return NextResponse.json({ error: 'Invalid collection or id' }, { status: 400 })
    }

    const db = await getDb()
    const lock = await editLocks.getLock(db, collection, id)

    if (!lock) {
      return NextResponse.json({ held: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json(
      { held: false, by: lock },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('admin-edit-lock GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const body = (await request.json()) as {
      collection?: string
      id?: number
      action?: string
    }

    const { collection = '', id, action = '' } = body

    if (!isValidCollectionSlug(collection) || !isValidDocId(id)) {
      return NextResponse.json({ error: 'Invalid collection or id' }, { status: 400 })
    }

    if (!['acquire', 'heartbeat', 'release', 'takeover'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const db = await getDb()
    const userId = context.user?.id ?? -1
    const userLabel = context.user?.email ?? 'unknown'

    if (action === 'acquire' || action === 'heartbeat') {
      const result = await editLocks.acquire(db, collection, id, { userId, label: userLabel })
      return NextResponse.json(result, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    if (action === 'release') {
      // Only the holder can release
      const lock = await editLocks.getLock(db, collection, id)
      if (lock && lock.userId !== userId) {
        return NextResponse.json({ error: 'not_holder' }, { status: 403 })
      }
      await editLocks.release(db, collection, id, userId)
      return NextResponse.json({ held: false }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    if (action === 'takeover') {
      await editLocks.takeOver(db, collection, id, { userId, label: userLabel })
      return NextResponse.json({ held: true }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('admin-edit-lock POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
