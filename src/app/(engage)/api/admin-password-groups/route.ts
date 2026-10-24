import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { getDb } from '@/cms/db/connect'
import { createGroup, deleteGroup, getGroup, listGroupMembers, listGroups, rotateGroupHash, updateGroupSettings } from '@/cms/db/passwordGroups'
import { noteDocumentChanged } from '@/features/dataViews/cache'
import { readSecuritySettingsFromD1 } from '@/features/security/settings'
import { purgeDocuments } from '@/features/visibility/docPaths'
import { recordGroupEvent } from '@/features/visibility/groupAudit'
import { hashPassword } from '@/features/visibility/password'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 80

type Context = Awaited<ReturnType<typeof getAdminContext>>

const canView = (context: Context) => context.isAdmin || context.can('admin-visibility-password', 'update')
const actorOf = (context: Context) => {
  const user = context.user as { id?: number | string; email?: string } | null | undefined
  return { id: user?.id ?? null, email: user?.email ?? null }
}

/** null = no expiry. undefined = not supplied. NaN-like or past values are rejected by the caller. */
function parseExpiry(value: unknown): string | null | undefined | 'invalid' {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const at = Date.parse(value)
  return Number.isFinite(at) ? new Date(at).toISOString() : 'invalid'
}

function parseMaxUses(value: unknown): number | null | undefined | 'invalid' {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(n) && n > 0 && n <= 1_000_000 ? n : 'invalid'
}

async function purgeMembers(context: Context, members: { collection: string; docId: number }[]): Promise<void> {
  for (const m of members) noteDocumentChanged(m.collection)
  await purgeDocuments(context.engine as never, members)
}

/** GET: every group with the content that uses it. Never returns a hash. */
export async function GET(): Promise<Response> {
  const context = await getAdminContext()
  if (!canView(context)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  try {
    const db = await getDb()
    const groups = await listGroups(db)
    const now = Date.now()
    const out = []
    for (const g of groups) {
      const members = await listGroupMembers(db, g.id)
      const items = []
      for (const m of members) {
        let title: string | null = null
        let slug: string | null = null
        try {
          const doc = (await context.engine.findByID({ collection: m.collection as 'pages', id: m.docId, depth: 0, overrideAccess: true })) as
            | { title?: string | null; name?: string | null; slug?: string | null }
            | null
          title = doc?.title ?? doc?.name ?? null
          slug = doc?.slug ?? null
        } catch {
          // A document that cannot be loaded is still listed by id.
        }
        items.push({ collection: m.collection, id: m.docId, title, slug })
      }
      out.push({
        id: g.id,
        name: g.name,
        expiresAt: g.expiresAt,
        expired: g.expiresAt ? !(Date.parse(g.expiresAt) > now) : false,
        maxUses: g.maxUses,
        useCount: g.useCount,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        content: items,
      })
    }
    const settings = await readSecuritySettingsFromD1()
    return NextResponse.json({ groups: out, enabled: settings.passwordGroups.enabled, isAdmin: context.isAdmin })
  } catch (error) {
    console.error('admin-password-groups GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function guardWrite(context: Context, needsSecret: boolean): Promise<Response | null> {
  if (!context.isAdmin) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (needsSecret) {
    if (!process.env.ENGAGE_SECRET) {
      return NextResponse.json(
        { error: 'Password protection is unavailable: the server is missing ENGAGE_SECRET. Ask your developer to set it.' },
        { status: 503 },
      )
    }
    const settings = await readSecuritySettingsFromD1()
    if (!settings.passwordGroups.enabled) {
      return NextResponse.json({ error: 'Shared password groups are switched off in Security settings.' }, { status: 409 })
    }
  }
  return null
}

/** POST: create a group. Body {name, password, expiresAt?, maxUses?} */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  const refused = await guardWrite(context, true)
  if (refused) return refused

  let body: { name?: unknown; password?: unknown; expiresAt?: unknown; maxUses?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > MAX_NAME_LENGTH) return NextResponse.json({ error: 'Give the group a name (up to 80 characters)' }, { status: 400 })
  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  }
  const expiresAt = parseExpiry(body.expiresAt)
  if (expiresAt === 'invalid' || (typeof expiresAt === 'string' && Date.parse(expiresAt) <= Date.now())) {
    return NextResponse.json({ error: 'Expiry must be a date in the future' }, { status: 400 })
  }
  const maxUses = parseMaxUses(body.maxUses)
  if (maxUses === 'invalid') return NextResponse.json({ error: 'Max uses must be a whole number above zero' }, { status: 400 })

  try {
    const db = await getDb()
    if ((await listGroups(db)).some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A group with that name already exists' }, { status: 409 })
    }
    const id = await createGroup(db, { name, hash: await hashPassword(body.password), expiresAt: expiresAt ?? null, maxUses: maxUses ?? null })
    await recordGroupEvent({
      action: 'password-group.created',
      headers: request.headers,
      actor: actorOf(context),
      groupId: id,
      detail: `created "${name}"${expiresAt ? ` expires ${expiresAt}` : ''}${maxUses ? ` max uses ${maxUses}` : ''}`,
    })
    return NextResponse.json({ ok: true, id }, { status: 200 })
  } catch (error) {
    console.error('admin-password-groups POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH: rotate the password or change settings.
 * Body {id, password} rotates (resets the use counter and signs every visitor of the group out).
 * Body {id, name?, expiresAt?, maxUses?, resetUses?} changes settings.
 */
export async function PATCH(request: Request): Promise<Response> {
  const context = await getAdminContext()
  let body: { id?: unknown; password?: unknown; name?: unknown; expiresAt?: unknown; maxUses?: unknown; resetUses?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const rotating = body.password !== undefined
  const refused = await guardWrite(context, rotating)
  if (refused) return refused

  const id = typeof body.id === 'number' ? body.id : Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const db = await getDb()
    const group = await getGroup(db, id)
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const members = await listGroupMembers(db, id)

    if (rotating) {
      if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
      }
      await rotateGroupHash(db, id, await hashPassword(body.password))
      await recordGroupEvent({
        action: 'password-group.rotated',
        headers: request.headers,
        actor: actorOf(context),
        groupId: id,
        detail: `rotated "${group.name}" (${members.length} document${members.length === 1 ? '' : 's'})`,
      })
      await purgeMembers(context, members)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const name = body.name === undefined ? undefined : typeof body.name === 'string' ? body.name.trim() : ''
    if (name !== undefined && (!name || name.length > MAX_NAME_LENGTH)) {
      return NextResponse.json({ error: 'Give the group a name (up to 80 characters)' }, { status: 400 })
    }
    if (name && name.toLowerCase() !== group.name.toLowerCase() && (await listGroups(db)).some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A group with that name already exists' }, { status: 409 })
    }
    const expiresAt = parseExpiry(body.expiresAt)
    if (expiresAt === 'invalid') return NextResponse.json({ error: 'Expiry must be a valid date' }, { status: 400 })
    const maxUses = parseMaxUses(body.maxUses)
    if (maxUses === 'invalid') return NextResponse.json({ error: 'Max uses must be a whole number above zero' }, { status: 400 })

    await updateGroupSettings(db, id, { name, expiresAt, maxUses, resetUses: body.resetUses === true }, group)
    await recordGroupEvent({
      action: 'password-group.updated',
      headers: request.headers,
      actor: actorOf(context),
      groupId: id,
      detail: `updated "${name ?? group.name}"`,
    })
    await purgeMembers(context, members)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-password-groups PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE ?id=<group id>[&confirm=1]
 * Deleting a group that documents still use would make those documents public, so it is refused (409,
 * with the list) until the caller confirms. Every affected URL is purged from the caches.
 */
export async function DELETE(request: Request): Promise<Response> {
  const context = await getAdminContext()
  const refused = await guardWrite(context, false)
  if (refused) return refused

  const url = new URL(request.url)
  const id = Number(url.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const db = await getDb()
    const group = await getGroup(db, id)
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const members = await listGroupMembers(db, id)
    if (members.length > 0 && url.searchParams.get('confirm') !== '1') {
      return NextResponse.json(
        { error: `${members.length} document${members.length === 1 ? ' still uses' : 's still use'} this group. Deleting it removes their protection.`, inUse: members.length },
        { status: 409 },
      )
    }
    await deleteGroup(db, id)
    await recordGroupEvent({
      action: 'password-group.deleted',
      headers: request.headers,
      actor: actorOf(context),
      groupId: id,
      detail: `deleted "${group.name}" (${members.length} document${members.length === 1 ? '' : 's'} released)`,
    })
    await purgeMembers(context, members)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-password-groups DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
