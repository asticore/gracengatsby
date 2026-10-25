import { cookies, headers } from 'next/headers'

import { accountContext, siteOrigin, type AccountContext } from '@/features/accounts/session'
import { originFromHeaders, recordAuthEvent } from '@/features/security/authAudit'
import { hit } from '@/features/security/rateLimit'
import { getSecuritySettings, type OrganizationSettings } from '@/features/security/settings'
import { getEngine } from '@/lib/engine'

import { sendOrganizationInviteEmail } from './email'
import { generateInviteToken, hashInviteToken } from './policy'
import { resolveActiveOrganization, type Actor, type OrgDeps } from './service'
import { defaultOrgStore } from './store'

/**
 * Server-only glue: builds the service's dependencies from the live engine,
 * settings, mailer and audit log. Not a 'use client' file, so server
 * components may call it. The actor is always the session's own account.
 */

export const ACTIVE_ORG_COOKIE = 'engage-org'

/** Invitations one account may send per minute (per isolate; see security/rateLimit.ts for what that is worth). */
export const INVITES_PER_MINUTE = 10

export type OrgRuntime = { context: AccountContext; deps: OrgDeps; actor: Actor | null; settings: OrganizationSettings }

export async function buildDeps(engine: AccountContext['engine'], settings: OrganizationSettings): Promise<OrgDeps> {
  const origin = originFromHeaders(await headers())
  return {
    settings,
    store: defaultOrgStore,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    newToken: generateInviteToken,
    hashToken: hashInviteToken,
    origin: await siteOrigin(),
    sendInvite: async (mail) => (await sendOrganizationInviteEmail(mail)).ok,
    allowInviteSend: (key) => !hit(key, INVITES_PER_MINUTE).limited,
    findUserIdByEmail: async (email) => {
      const found = await engine.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
      const doc = found.docs[0] as { id: number } | undefined
      return doc ? Number(doc.id) : null
    },
    audit: async (entry) => {
      // Never throws: a log line cannot fail the action it describes.
      await recordAuthEvent(engine, { action: entry.action, actorId: entry.actorId, actorEmail: entry.actorEmail, collectionSlug: 'organizations', documentId: entry.organizationId, detail: entry.detail }, origin)
    },
  }
}

export async function orgRuntime(): Promise<OrgRuntime> {
  const context = await accountContext()
  const settings = (await getSecuritySettings(context.engine as never)).organizations
  const deps = await buildDeps(context.engine, settings)
  const user = context.user as unknown as { id: number | string; email?: string; roles?: unknown } | null
  const actor: Actor | null = user && context.flags.accounts ? { id: Number(user.id), email: String(user.email ?? ''), roles: user.roles ?? [] } : null
  return { context, deps, actor, settings }
}

/** Runtime for the admin screen: the signed-in administrator, or null. */
export async function adminRuntime(): Promise<{ deps: OrgDeps; admin: Actor | null }> {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: await headers() }).catch((): { user: null } => ({ user: null }))
  const doc = user as unknown as { id: number | string; email?: string; roles?: unknown } | null
  const settings = (await getSecuritySettings(engine as never)).organizations
  const deps = await buildDeps(engine, settings)
  const admin: Actor | null = doc && Array.isArray(doc.roles) && doc.roles.includes('admin') ? { id: Number(doc.id), email: String(doc.email ?? ''), roles: doc.roles } : null
  return { deps, admin }
}

/** The organisation this session is working in, or null. Honours the cookie only while the account is still a member. */
export async function activeOrganization(runtime: OrgRuntime) {
  if (!runtime.actor) return null
  const jar = await cookies()
  return resolveActiveOrganization(runtime.deps, runtime.actor.id, jar.get(ACTIVE_ORG_COOKIE)?.value ?? null)
}

/** Email addresses for a set of member ids, for display to fellow members only. */
export async function memberEmails(engine: AccountContext['engine'], ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  for (const id of [...new Set(ids)]) {
    const row = (await engine.findByID({ collection: 'users', id, depth: 0, overrideAccess: true }).catch((): null => null)) as { email?: string } | null
    if (row?.email) out.set(id, row.email)
  }
  return out
}
