import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { assertDocAccess, docAccessDenied } from '@/features/roles/docAccess'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash, clearPassword } from '@/cms/db/contentPasswords'
import { clearAccessRule, getAccessRule, getGroup, setAccessRule } from '@/cms/db/passwordGroups'
import { noteDocumentChanged } from '@/features/dataViews/cache'
import { readSecuritySettingsFromD1 } from '@/features/security/settings'
import { purgeDocuments } from '@/features/visibility/docPaths'
import { recordGroupEvent } from '@/features/visibility/groupAudit'

export const dynamic = 'force-dynamic'

/**
 * Per-document visibility beyond a single password: use a shared password group, or make the document
 * visible to signed-in accounts (optionally limited to roles / membership tiers, optionally with a group
 * password as the alternative on the gate). A document has one protection at a time, so setting a rule
 * clears its own password.
 */

const ALLOWED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])
const SLUG = /^[A-Za-z0-9_-]{1,64}$/
const MAX_LIST = 20

type Context = Awaited<ReturnType<typeof getAdminContext>>

const allowed = (context: Context) => context.isAdmin || context.can('admin-visibility-password', 'update')

function parseList(value: unknown): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_LIST) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !SLUG.test(item.trim())) return null
    if (!out.includes(item.trim())) out.push(item.trim())
  }
  return out
}

export async function GET(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!allowed(context)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const url = new URL(request.url)
  const collection = url.searchParams.get('collection') ?? ''
  const id = Number(url.searchParams.get('id'))
  if (!ALLOWED_COLLECTIONS.has(collection)) return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return docAccessDenied(access)

  try {
    const db = await getDb()
    const [rule, hash] = await Promise.all([getAccessRule(db, collection, id), getPasswordHash(db, collection, id)])
    const group = rule?.groupId ? await getGroup(db, rule.groupId) : null
    return NextResponse.json({
      hasPassword: hash !== null,
      mode: rule?.mode ?? null,
      groupId: rule?.groupId ?? null,
      groupName: group?.name ?? null,
      roles: rule?.roles ?? [],
      tiers: rule?.tiers ?? [],
    })
  } catch (error) {
    console.error('admin-visibility-access GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST {collection, id, mode: 'group' | 'accounts', groupId?, roles?, tiers?} */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!allowed(context)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  let body: { collection?: unknown; id?: unknown; mode?: unknown; groupId?: unknown; roles?: unknown; tiers?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { collection, id, mode } = body
  if (typeof collection !== 'string' || !ALLOWED_COLLECTIONS.has(collection)) return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  if (mode !== 'group' && mode !== 'accounts') return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  const roles = parseList(body.roles)
  const tiers = parseList(body.tiers)
  if (!roles || !tiers) return NextResponse.json({ error: 'Roles and tiers must be short names (letters, numbers, - and _)' }, { status: 400 })

  let groupId: number | null = null
  if (body.groupId !== undefined && body.groupId !== null && body.groupId !== '') {
    groupId = Number(body.groupId)
    if (!Number.isInteger(groupId) || groupId <= 0) return NextResponse.json({ error: 'Invalid group' }, { status: 400 })
  }
  if (mode === 'group' && groupId === null) return NextResponse.json({ error: 'Choose a password group' }, { status: 400 })

  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return docAccessDenied(access)

  if (groupId !== null) {
    if (!process.env.ENGAGE_SECRET) {
      return NextResponse.json({ error: 'Password protection is unavailable: the server is missing ENGAGE_SECRET. Ask your developer to set it.' }, { status: 503 })
    }
    if (!(await readSecuritySettingsFromD1()).passwordGroups.enabled) {
      return NextResponse.json({ error: 'Shared password groups are switched off in Security settings.' }, { status: 409 })
    }
  }

  try {
    const db = await getDb()
    let groupName: string | null = null
    if (groupId !== null) {
      const group = await getGroup(db, groupId)
      if (!group) return NextResponse.json({ error: 'That password group no longer exists' }, { status: 404 })
      groupName = group.name
    }
    await setAccessRule(db, { collection, docId: id, mode, groupId, roles, tiers })
    await clearPassword(db, collection, id)

    if (groupId !== null) {
      const user = context.user as { id?: number | string; email?: string } | null | undefined
      await recordGroupEvent({
        action: 'password-group.assigned',
        headers: request.headers,
        actor: { id: user?.id ?? null, email: user?.email ?? null },
        groupId,
        detail: `${collection}/${id} now uses "${groupName}"`,
      })
    }
    noteDocumentChanged(collection)
    await purgeDocuments(context.engine as never, [{ collection, docId: id }])
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-visibility-access POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE ?collection=&id= : remove the group / accounts rule. */
export async function DELETE(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!allowed(context)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  const url = new URL(request.url)
  const collection = url.searchParams.get('collection') ?? ''
  const id = Number(url.searchParams.get('id'))
  if (!ALLOWED_COLLECTIONS.has(collection)) return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return docAccessDenied(access)

  try {
    const db = await getDb()
    await clearAccessRule(db, collection, id)
    noteDocumentChanged(collection)
    await purgeDocuments(context.engine as never, [{ collection, docId: id }])
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-visibility-access DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
