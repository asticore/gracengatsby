import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { assertDocAccess, docAccessDenied } from '@/features/roles/docAccess'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import {
  MAX_GROUP_MEMBERS,
  MAX_UNLOCK_TIERS,
  UNLOCK_ROLES,
  getItemGroupId,
  getPasswordGroup,
  getUnlockRules,
  groupMembers,
  listPasswordGroups,
  setItemGroup,
  setUnlockRules,
} from '@/cms/db/passwordGroups'
import { getEngine } from '@/lib/engine'
import { MEMBERSHIP_TIERS_SLUG } from '@/features/members/slugs'
import type { EngineQuery } from '@/features/members/entitlement'

export const dynamic = 'force-dynamic'

const ALLOWED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])

/**
 * Per-item access settings on a protected document: which shared password group
 * it belongs to, and which signed-in roles and membership tiers may open it
 * without typing the password. Lives beside admin-visibility-password, which
 * still owns setting or removing the item's own password.
 *
 * GET ?collection=&id=  -> { protected, groupId, unlockRoles, unlockTiers, groups, tiers, roles }
 * PUT { collection, id, groupId?, unlockRoles?, unlockTiers? }  -> { ok }
 */

const authorised = async (): Promise<Awaited<ReturnType<typeof getAdminContext>> | null> => {
  const context = await getAdminContext()
  return context.isAdmin || context.can('admin-visibility-password', 'update') ? context : null
}

const parseTarget = (collection: unknown, id: unknown): { collection: string; id: number } | null => {
  if (typeof collection !== 'string' || !ALLOWED_COLLECTIONS.has(collection)) return null
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null
  return { collection, id }
}

async function loadTiers(): Promise<{ id: number; name: string }[]> {
  const engine = (await getEngine()) as unknown as EngineQuery
  const { docs } = await engine
    .find({ collection: MEMBERSHIP_TIERS_SLUG, limit: 100, depth: 0, overrideAccess: true })
    .catch((): { docs: unknown[] } => ({ docs: [] }))
  return (docs as { id: number | string; name?: string | null }[]).map((tier) => ({
    id: Number(tier.id),
    name: tier.name ?? `Tier ${tier.id}`,
  }))
}

export async function GET(request: Request): Promise<Response> {
  const context = await authorised()
  if (!context) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const url = new URL(request.url)
  const target = parseTarget(url.searchParams.get('collection') ?? '', Number(url.searchParams.get('id')))
  if (!target) return NextResponse.json({ error: 'Invalid collection or id' }, { status: 400 })

  const access = await assertDocAccess(context, target.collection, target.id, 'update')
  if (!access.ok) return docAccessDenied(access)

  try {
    const db = await getDb()
    const hash = await getPasswordHash(db, target.collection, target.id)
    const rules = await getUnlockRules(db, target.collection, target.id)
    return NextResponse.json(
      {
        protected: hash !== null,
        groupId: await getItemGroupId(db, target.collection, target.id),
        unlockRoles: rules?.roles ?? [],
        unlockTiers: rules?.tiers ?? [],
        groups: (await listPasswordGroups(db)).map((group) => ({ id: group.id, name: group.name })),
        tiers: await loadTiers(),
        roles: UNLOCK_ROLES,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('admin-visibility-access GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<Response> {
  const context = await authorised()
  if (!context) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  let body: { collection?: unknown; id?: unknown; groupId?: unknown; unlockRoles?: unknown; unlockTiers?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const target = parseTarget(body.collection, body.id)
  if (!target) return NextResponse.json({ error: 'Invalid collection or id' }, { status: 400 })

  // Validate everything before writing anything.
  let groupId: number | null | undefined
  if (body.groupId !== undefined) {
    if (body.groupId === null) {
      groupId = null
    } else if (typeof body.groupId === 'number' && Number.isInteger(body.groupId) && body.groupId > 0) {
      groupId = body.groupId
    } else {
      return NextResponse.json({ error: 'Invalid group' }, { status: 400 })
    }
  }

  let roles: string[] | undefined
  if (body.unlockRoles !== undefined) {
    if (!Array.isArray(body.unlockRoles) || !body.unlockRoles.every((role) => (UNLOCK_ROLES as readonly string[]).includes(role as string))) {
      return NextResponse.json({ error: 'Unknown role' }, { status: 400 })
    }
    roles = [...new Set(body.unlockRoles as string[])]
  }

  let tiers: number[] | undefined
  if (body.unlockTiers !== undefined) {
    if (
      !Array.isArray(body.unlockTiers) ||
      body.unlockTiers.length > MAX_UNLOCK_TIERS ||
      !body.unlockTiers.every((tier) => typeof tier === 'number' && Number.isInteger(tier) && tier > 0)
    ) {
      return NextResponse.json({ error: 'Invalid membership tier' }, { status: 400 })
    }
    tiers = [...new Set(body.unlockTiers as number[])]
  }

  const access = await assertDocAccess(context, target.collection, target.id, 'update')
  if (!access.ok) return docAccessDenied(access)

  try {
    const db = await getDb()
    const currentGroup = await getItemGroupId(db, target.collection, target.id)

    if (groupId === null && currentGroup !== null) {
      // The group password is the only password the item has. Leaving the group needs its own password first.
      return NextResponse.json({ error: 'Set the item’s own password before removing it from the group' }, { status: 409 })
    }
    if (typeof groupId === 'number' && groupId !== currentGroup) {
      if (!(await getPasswordGroup(db, groupId))) return NextResponse.json({ error: 'Group not found' }, { status: 400 })
      if ((await groupMembers(db, groupId)).length >= MAX_GROUP_MEMBERS) {
        return NextResponse.json({ error: `A group can protect at most ${MAX_GROUP_MEMBERS} items` }, { status: 409 })
      }
      await setItemGroup(db, target.collection, target.id, groupId)
    }

    if (roles !== undefined || tiers !== undefined) {
      const current = (await getUnlockRules(db, target.collection, target.id)) ?? { roles: [], tiers: [] }
      const saved = await setUnlockRules(db, target.collection, target.id, {
        roles: roles ?? current.roles,
        tiers: tiers ?? current.tiers,
      })
      if (!saved) {
        return NextResponse.json({ error: 'Protect the item with a password or group before choosing who may open it' }, { status: 409 })
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-visibility-access PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
