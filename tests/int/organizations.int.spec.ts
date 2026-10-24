// @vitest-environment node
// Customer organisations. The real SQL (src/features/organizations/store.ts) runs on an in-memory SQLite
// database created from the migration's own statements, behind a D1-shaped adapter. The service runs against
// that store with a recording mailer and audit log, so authorisation, last-owner and invitation rules are
// exercised end to end without an engine.
import { DatabaseSync } from 'node:sqlite'

import { beforeEach, describe, expect, it } from 'vitest'

import { ORGANIZATION_INDEXES, ORGANIZATION_TABLES } from '@/migrations/20261124_100000_organizations'
import { createD1OrgStore, type D1Like } from '@/features/organizations/store'
import {
  ORG_ACTIONS,
  ROLE_PERMISSIONS,
  cleanPermissions,
  hasOrgPermission,
  permissionsForRole,
  roleHasPermission,
  validRoleName,
} from '@/features/organizations/permissions'
import {
  generateInviteToken,
  hashInviteToken,
  inviteProblem,
  isInviteTokenShape,
  mayAssignRole,
  mayManageMember,
  normaliseLogo,
  normaliseMetadata,
  normaliseSlug,
} from '@/features/organizations/policy'
import {
  acceptInvite,
  adminDeleteOrganization,
  adminListOrganizations,
  cancelInvite,
  changeMemberRole,
  createOrganization,
  createTeam,
  declineInvite,
  deleteCustomRole,
  deleteOrganization,
  deleteTeam,
  getOrganization,
  inviteMember,
  leaveOrganization,
  listMyOrganizations,
  previewInvite,
  removeMember,
  resendInvite,
  resolveActiveOrganization,
  saveCustomRole,
  setTeamMembership,
  transferOwnership,
  updateOrganization,
  type Actor,
  type InviteMail,
  type OrgAuditEntry,
  type OrgDeps,
} from '@/features/organizations/service'
import { getOrgVisibility, listOrgRestrictedIds, setOrgVisibility, clearOrgVisibility, viewerMayRead } from '@/features/organizations/visibility'
import { DEFAULT_ORGANIZATION_SETTINGS, DEFAULT_SECURITY_SETTINGS, organizationsFrom, type OrganizationSettings } from '@/features/security/settings'
import { hit, resetRateLimiter } from '@/features/security/rateLimit'
import { AUTH_AUDIT_ACTIONS } from '@/features/security/auditLog'

function sqliteD1(db: DatabaseSync): D1Like {
  return {
    prepare(query: string) {
      const stmt = db.prepare(query)
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const result = stmt.run(...(values as never[]))
            return { meta: { changes: Number(result.changes) } }
          },
          all: async () => ({ results: stmt.all(...(values as never[])) }),
          first: async () => stmt.get(...(values as never[])) ?? null,
        }),
      }
    },
  }
}

const ANN: Actor = { id: 1, email: 'ann@example.com', roles: ['customer'] }
const BOB: Actor = { id: 2, email: 'bob@example.com', roles: ['customer'] }
const CAL: Actor = { id: 3, email: 'cal@example.com', roles: ['customer'] }
const EVE: Actor = { id: 4, email: 'eve@example.com', roles: ['customer'] }
const SITE_ADMIN: Actor = { id: 99, email: 'root@example.com', roles: ['admin'] }

const USERS: Record<string, number> = { 'ann@example.com': 1, 'bob@example.com': 2, 'cal@example.com': 3, 'eve@example.com': 4 }

let db: DatabaseSync
let d1: D1Like
let clock = Date.parse('2026-11-24T00:00:00.000Z')
let counter = 0
let mails: InviteMail[]
let audits: OrgAuditEntry[]
let mailWorks = true
let allowSends = true
let settings: OrganizationSettings

const makeDeps = (): OrgDeps => ({
  settings,
  store: createD1OrgStore(async () => d1),
  now: () => clock,
  newId: () => `id-${++counter}`,
  newToken: generateInviteToken,
  hashToken: hashInviteToken,
  origin: 'https://site.test',
  sendInvite: async (mail) => {
    mails.push(mail)
    return mailWorks
  },
  allowInviteSend: () => allowSends,
  findUserIdByEmail: async (email) => USERS[email] ?? null,
  audit: async (entry) => {
    audits.push(entry)
  },
})

const tokenFrom = (mail: InviteMail): string => mail.link.split('/account/invite/')[1]

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const statement of [...ORGANIZATION_TABLES, ...ORGANIZATION_INDEXES]) db.exec(statement)
  d1 = sqliteD1(db)
  clock = Date.parse('2026-11-24T00:00:00.000Z')
  counter = 0
  mails = []
  audits = []
  mailWorks = true
  allowSends = true
  settings = { ...DEFAULT_ORGANIZATION_SETTINGS, enabled: true }
  resetRateLimiter()
})

/** Ann owns "Acme"; Bob is an admin and Cal a member, both through real invitations. */
async function acme(deps = makeDeps()) {
  const created = await createOrganization(deps, ANN, { name: 'Acme Co' })
  const orgId = created.value.id
  for (const [actor, role] of [[BOB, 'admin'], [CAL, 'member']] as const) {
    const invited = await inviteMember(deps, ANN, orgId, { email: actor.email, role })
    expect(invited.ok).toBe(true)
    const accepted = await acceptInvite(deps, actor, tokenFrom(mails[mails.length - 1]))
    expect(accepted.ok).toBe(true)
  }
  return { deps, orgId }
}

describe('settings', () => {
  it('are off by default with sensible limits, and clamp what is stored', () => {
    expect(DEFAULT_SECURITY_SETTINGS.organizations).toEqual({ enabled: false, maxPerAccount: 5, whoMayCreate: 'anyone' })
    expect(organizationsFrom(() => undefined)).toEqual(DEFAULT_ORGANIZATION_SETTINGS)
    const read = organizationsFrom((c) => ({ organizations_enabled: 1, organizations_max_per_account: 9999, organizations_who_may_create: 'admins' })[c])
    expect(read).toEqual({ enabled: true, maxPerAccount: 100, whoMayCreate: 'admins' })
    expect(organizationsFrom((c) => (c === 'organizations_who_may_create' ? 'bogus' : undefined)).whoMayCreate).toBe('anyone')
  })

  it('writes organisation events the audit screen lists', () => {
    for (const action of ['organization.created', 'organization.deleted', 'organization.invite-sent', 'organization.refused']) expect(AUTH_AUDIT_ACTIONS).toContain(action)
    expect(new Set(AUTH_AUDIT_ACTIONS).size).toBe(AUTH_AUDIT_ACTIONS.length)
  })
})

describe('permissions', () => {
  it('maps owner to everything, admin to everything but delete and transfer, member to read-only', () => {
    expect(ROLE_PERMISSIONS.owner).toEqual(ORG_ACTIONS)
    expect(ROLE_PERMISSIONS.admin).not.toContain('organization:delete')
    expect(ROLE_PERMISSIONS.admin).not.toContain('organization:transfer')
    expect(ROLE_PERMISSIONS.admin).toContain('member:remove')
    expect(ROLE_PERMISSIONS.member).toEqual(['organization:read', 'member:read', 'team:read', 'content:read'])
    expect(roleHasPermission('member', 'member:remove')).toBe(false)
    expect(permissionsForRole('nobody-knows')).toEqual([])
  })

  it('custom roles carry only known, non-owner-only permissions', () => {
    expect(cleanPermissions(['member:read', 'organization:delete', 'bogus', 'member:read'])).toEqual(['member:read'])
    expect(validRoleName('billing')).toBe(true)
    expect(validRoleName('owner')).toBe(false)
    expect(validRoleName('Bad Name')).toBe(false)
    expect(roleHasPermission('billing', 'team:read', { billing: ['team:read'] })).toBe(true)
    expect(roleHasPermission('billing', 'organization:delete', { billing: ['organization:delete'] })).toBe(false)
  })

  it('hasOrgPermission answers per organisation and fails closed', async () => {
    const { deps, orgId } = await acme()
    const store = {
      getMemberRole: async (o: string, u: number) => (await deps.store.getMember(o, u))?.role ?? null,
      getCustomRole: async (o: string, n: string) => (await deps.store.getRole(o, n))?.permissions ?? null,
    }
    const ctx = (user: { id: number } | null, extra = {}) => ({ user, orgStore: store, organizationsEnabled: true, ...extra })
    expect(await hasOrgPermission(ctx(ANN), orgId, 'organization:delete')).toBe(true)
    expect(await hasOrgPermission(ctx(BOB), orgId, 'organization:delete')).toBe(false)
    expect(await hasOrgPermission(ctx(BOB), orgId, 'member:remove')).toBe(true)
    expect(await hasOrgPermission(ctx(CAL), orgId, 'content:read')).toBe(true)
    expect(await hasOrgPermission(ctx(CAL), orgId, 'invitation:create')).toBe(false)
    expect(await hasOrgPermission(ctx(EVE), orgId, 'organization:read')).toBe(false)
    expect(await hasOrgPermission(ctx(null), orgId, 'organization:read')).toBe(false)
    expect(await hasOrgPermission(ctx(ANN), 'other-org', 'organization:read')).toBe(false)
    expect(await hasOrgPermission(ctx(ANN, { organizationsEnabled: false }), orgId, 'organization:read')).toBe(false)
    expect(await hasOrgPermission(ctx(ANN), orgId, 'made:up' as never)).toBe(false)
    expect(await hasOrgPermission({ user: { id: 1 }, organizationsEnabled: true, orgStore: { getMemberRole: async () => { throw new Error('db down') }, getCustomRole: async () => null } }, orgId, 'organization:read')).toBe(false)
  })

  it('applies a custom role named on a member, including after the role is edited', async () => {
    const { deps, orgId } = await acme()
    expect((await saveCustomRole(deps, ANN, orgId, 'billing', ['invitation:read', 'team:read'])).ok).toBe(true)
    expect((await changeMemberRole(deps, ANN, orgId, CAL.id, 'billing')).ok).toBe(true)
    const store = {
      getMemberRole: async (o: string, u: number) => (await deps.store.getMember(o, u))?.role ?? null,
      getCustomRole: async (o: string, n: string) => (await deps.store.getRole(o, n))?.permissions ?? null,
    }
    const ctx = { user: CAL, orgStore: store, organizationsEnabled: true }
    expect(await hasOrgPermission(ctx, orgId, 'invitation:read')).toBe(true)
    expect(await hasOrgPermission(ctx, orgId, 'member:remove')).toBe(false)
    await saveCustomRole(deps, ANN, orgId, 'billing', ['team:read'])
    expect(await hasOrgPermission(ctx, orgId, 'invitation:read')).toBe(false)
  })
})

describe('organisation lifecycle', () => {
  it('refuses everything while the feature is off', async () => {
    settings = { ...settings, enabled: false }
    const result = await createOrganization(makeDeps(), ANN, { name: 'Acme' })
    expect(result.code).toBe('disabled')
    expect((await listMyOrganizations(makeDeps(), ANN)).code).toBe('disabled')
    expect((await previewInvite(makeDeps(), generateInviteToken())).code).toBe('disabled')
  })

  it('creates with a slug, optional logo and metadata, makes the creator the owner and audits it', async () => {
    const deps = makeDeps()
    const created = await createOrganization(deps, ANN, { name: '  Acme   Co ', logo: 'https://cdn.test/logo.png', metadata: { plan: 'free' } })
    expect(created.ok).toBe(true)
    expect(created.value.slug).toBe('acme-co')
    expect(created.value.metadata).toBe('{"plan":"free"}')
    expect((await deps.store.getMember(created.value.id, ANN.id))?.role).toBe('owner')
    expect(audits.map((a) => a.action)).toContain('organization.created')
    expect((await createOrganization(deps, BOB, { name: 'Acme Co' })).code).toBe('slug_taken')
    expect((await createOrganization(deps, BOB, { name: 'X' })).code).toBe('invalid')
    expect((await createOrganization(deps, BOB, { name: 'Good name', logo: 'javascript:alert(1)' })).code).toBe('invalid')
    expect((await createOrganization(deps, BOB, { name: 'Good name', metadata: '[1]' })).code).toBe('invalid')
    expect((await createOrganization(deps, null, { name: 'Good name' })).code).toBe('signed_out')
  })

  it('enforces the per-account limit and the who-may-create setting', async () => {
    settings = { ...settings, maxPerAccount: 2 }
    const deps = makeDeps()
    expect((await createOrganization(deps, ANN, { name: 'One org' })).ok).toBe(true)
    expect((await createOrganization(deps, ANN, { name: 'Two org' })).ok).toBe(true)
    expect((await createOrganization(deps, ANN, { name: 'Three org' })).code).toBe('limit_reached')
    settings = { ...settings, whoMayCreate: 'admins' }
    expect((await createOrganization(makeDeps(), BOB, { name: 'Bobs org' })).code).toBe('creation_restricted')
    expect((await createOrganization(makeDeps(), SITE_ADMIN, { name: 'Admin org' })).ok).toBe(true)
  })

  it('lets only the owner delete, cascading to members, teams, invitations, roles and content limits', async () => {
    const { deps, orgId } = await acme()
    const team = await createTeam(deps, ANN, orgId, 'Ops')
    await setTeamMembership(deps, ANN, orgId, team.value.id, CAL.id, true)
    await saveCustomRole(deps, ANN, orgId, 'billing', ['team:read'])
    await setOrgVisibility(d1, 'pages', 7, orgId, '2026-11-24T00:00:00.000Z')
    expect((await deleteOrganization(deps, BOB, orgId)).code).toBe('forbidden')
    expect((await deleteOrganization(deps, EVE, orgId)).code).toBe('not_found')
    expect((await deleteOrganization(deps, ANN, orgId)).ok).toBe(true)
    for (const table of ['eg_organizations', 'eg_organization_members', 'eg_organization_teams', 'eg_organization_team_members', 'eg_organization_invitations', 'eg_organization_roles', 'eg_content_org_visibility']) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, table).toBe(0)
    }
  })

  it('updates details only with permission and never to a taken slug', async () => {
    const { deps, orgId } = await acme()
    await createOrganization(deps, EVE, { name: 'Other Co' })
    expect((await updateOrganization(deps, CAL, orgId, { name: 'Hacked' })).code).toBe('forbidden')
    expect((await updateOrganization(deps, EVE, orgId, { name: 'Hacked' })).code).toBe('not_found')
    expect((await updateOrganization(deps, BOB, orgId, { slug: 'other-co' })).code).toBe('slug_taken')
    const ok = await updateOrganization(deps, BOB, orgId, { name: 'Acme Inc', slug: 'acme-inc', logo: '', metadata: { a: 1 } })
    expect(ok.ok).toBe(true)
    expect(ok.value.name).toBe('Acme Inc')
    expect(ok.value.logo).toBeNull()
  })

  it('lets a site administrator list with member counts and delete any organization', async () => {
    const { deps, orgId } = await acme()
    const listed = await adminListOrganizations(deps, SITE_ADMIN)
    expect(listed.value.map((o) => [o.name, o.memberCount])).toEqual([['Acme Co', 3]])
    expect((await adminListOrganizations(deps, ANN)).code).toBe('forbidden')
    expect((await adminDeleteOrganization(deps, ANN, orgId)).code).toBe('forbidden')
    audits = []
    settings = { ...settings, enabled: false }
    expect((await adminDeleteOrganization(makeDeps(), SITE_ADMIN, orgId)).ok).toBe(true)
    expect(audits.map((a) => a.action)).toEqual(['organization.deleted'])
    expect((await adminDeleteOrganization(makeDeps(), SITE_ADMIN, orgId)).code).toBe('not_found')
  })
})

describe('authorization', () => {
  it('a non-member cannot read an organisation, and gets the same answer as for one that does not exist', async () => {
    const { deps, orgId } = await acme()
    const stranger = await getOrganization(deps, EVE, orgId)
    const missing = await getOrganization(deps, EVE, 'no-such-org')
    expect(stranger.ok).toBe(false)
    expect(stranger.code).toBe('not_found')
    expect(stranger).toEqual(missing)
    expect((await getOrganization(deps, null, orgId)).code).toBe('signed_out')
    expect((await listMyOrganizations(deps, EVE)).value).toEqual([])
    expect((await inviteMember(deps, EVE, orgId, { email: 'x@example.com' })).code).toBe('not_found')
    expect((await removeMember(deps, EVE, orgId, CAL.id)).code).toBe('not_found')
    expect((await changeMemberRole(deps, EVE, orgId, CAL.id, 'admin')).code).toBe('not_found')
    expect((await createTeam(deps, EVE, orgId, 'Spies')).code).toBe('not_found')
    expect((await leaveOrganization(deps, EVE, orgId)).code).toBe('not_found')
  })

  it('shows a plain member the roster but no invitations', async () => {
    const { deps, orgId } = await acme()
    await inviteMember(deps, ANN, orgId, { email: 'new@example.com' })
    const asMember = await getOrganization(deps, CAL, orgId)
    expect(asMember.value.members).toHaveLength(3)
    expect(asMember.value.invites).toEqual([])
    expect(asMember.value.permissions).not.toContain('invitation:create')
    const asOwner = await getOrganization(deps, ANN, orgId)
    expect(asOwner.value.invites.filter((i) => i.status === 'pending')).toHaveLength(1)
    expect(JSON.stringify(asOwner.value)).not.toContain('tokenHash')
  })

  it('an admin cannot remove, demote or promote an owner; only an owner can make owners', async () => {
    const { deps, orgId } = await acme()
    expect((await removeMember(deps, BOB, orgId, ANN.id)).code).toBe('owner_protected')
    expect((await changeMemberRole(deps, BOB, orgId, ANN.id, 'member')).code).toBe('owner_protected')
    expect((await changeMemberRole(deps, BOB, orgId, CAL.id, 'owner')).code).toBe('owner_protected')
    expect((await inviteMember(deps, BOB, orgId, { email: 'x@example.com', role: 'owner' })).code).toBe('owner_protected')
    expect((await deps.store.getMember(orgId, ANN.id))?.role).toBe('owner')
    expect((await changeMemberRole(deps, ANN, orgId, CAL.id, 'owner')).ok).toBe(true)
    expect(mayManageMember('admin', 'owner')).toBe(false)
    expect(mayManageMember('admin', 'admin')).toBe(true)
    expect(mayManageMember('member', 'member')).toBe(false)
    expect(mayAssignRole('admin', 'owner')).toBe(false)
    expect(audits.filter((a) => a.action === 'organization.refused').length).toBeGreaterThanOrEqual(4)
  })

  it('a plain member cannot invite, remove, change roles or manage teams', async () => {
    const { deps, orgId } = await acme()
    expect((await inviteMember(deps, CAL, orgId, { email: 'x@example.com' })).code).toBe('forbidden')
    expect((await removeMember(deps, CAL, orgId, BOB.id)).code).toBe('forbidden')
    expect((await changeMemberRole(deps, CAL, orgId, BOB.id, 'member')).code).toBe('forbidden')
    expect((await createTeam(deps, CAL, orgId, 'Team')).code).toBe('forbidden')
    expect((await transferOwnership(deps, BOB, orgId, BOB.id)).code).toBe('forbidden')
  })

  it('refuses invalid roles, unknown custom roles and over-granting', async () => {
    const { deps, orgId } = await acme()
    expect((await changeMemberRole(deps, ANN, orgId, CAL.id, 'ghost')).code).toBe('invalid')
    expect((await changeMemberRole(deps, ANN, orgId, CAL.id, 'Bad Role!')).code).toBe('invalid')
    expect((await saveCustomRole(deps, ANN, orgId, 'owner', ['team:read'])).code).toBe('invalid')
    expect((await saveCustomRole(deps, CAL, orgId, 'mine', ['team:read'])).code).toBe('forbidden')
    await saveCustomRole(deps, BOB, orgId, 'readers', ['organization:delete', 'team:read'])
    expect((await deps.store.getRole(orgId, 'readers'))?.permissions).toEqual(['team:read'])
  })

  it('refuses to delete a custom role that is still in use', async () => {
    const { deps, orgId } = await acme()
    await saveCustomRole(deps, ANN, orgId, 'billing', ['team:read'])
    await changeMemberRole(deps, ANN, orgId, CAL.id, 'billing')
    expect((await deleteCustomRole(deps, ANN, orgId, 'billing')).code).toBe('role_in_use')
    await changeMemberRole(deps, ANN, orgId, CAL.id, 'member')
    expect((await deleteCustomRole(deps, ANN, orgId, 'billing')).ok).toBe(true)
  })
})

describe('last owner and ownership transfer', () => {
  it('the only owner cannot leave, be removed or be demoted', async () => {
    const { deps, orgId } = await acme()
    expect((await leaveOrganization(deps, ANN, orgId)).code).toBe('last_owner')
    expect((await removeMember(deps, ANN, orgId, ANN.id)).code).toBe('last_owner')
    expect((await changeMemberRole(deps, ANN, orgId, ANN.id, 'admin')).code).toBe('last_owner')
    expect((await deps.store.getMember(orgId, ANN.id))?.role).toBe('owner')
  })

  it('the store itself refuses to drop the last owner, so a race cannot', async () => {
    const { deps, orgId } = await acme()
    expect(await deps.store.removeMember(orgId, ANN.id)).toBe(false)
    expect(await deps.store.setMemberRole(orgId, ANN.id, 'member')).toBe(false)
    expect(await deps.store.countMembersWithRole(orgId, 'owner')).toBe(1)
  })

  it('a second owner lets the first leave; transfer makes the old owner an admin and keeps one owner', async () => {
    const { deps, orgId } = await acme()
    expect((await transferOwnership(deps, ANN, orgId, CAL.id)).ok).toBe(true)
    expect((await deps.store.getMember(orgId, CAL.id))?.role).toBe('owner')
    expect((await deps.store.getMember(orgId, ANN.id))?.role).toBe('admin')
    expect(await deps.store.countMembersWithRole(orgId, 'owner')).toBe(1)
    expect((await leaveOrganization(deps, ANN, orgId)).ok).toBe(true)
    expect((await deps.store.getMember(orgId, ANN.id))).toBeNull()
    expect((await transferOwnership(deps, CAL, orgId, EVE.id)).code).toBe('not_found')
    expect((await transferOwnership(deps, CAL, orgId, CAL.id)).code).toBe('invalid')
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['organization.owner-transferred', 'organization.member-left']))
  })

  it('removing a member also removes their team seats', async () => {
    const { deps, orgId } = await acme()
    const team = await createTeam(deps, ANN, orgId, 'Ops')
    await setTeamMembership(deps, ANN, orgId, team.value.id, CAL.id, true)
    expect(await deps.store.listTeamMembers(team.value.id)).toEqual([CAL.id])
    expect((await removeMember(deps, BOB, orgId, CAL.id)).ok).toBe(true)
    expect(await deps.store.listTeamMembers(team.value.id)).toEqual([])
  })
})

describe('invitations', () => {
  it('stores only a hash of the token and emails the link with the raw token', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    const sent = await inviteMember(deps, ANN, value.id, { email: ' Bob@Example.com ', role: 'admin' })
    expect(sent.ok).toBe(true)
    expect(sent.value.emailSent).toBe(true)
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toBe('bob@example.com')
    expect(mails[0].link.startsWith('https://site.test/account/invite/orgi_')).toBe(true)
    const token = tokenFrom(mails[0])
    expect(isInviteTokenShape(token)).toBe(true)
    const dump = JSON.stringify(db.prepare('SELECT * FROM eg_organization_invitations').all())
    expect(dump).not.toContain(token)
    const row = db.prepare('SELECT token_hash FROM eg_organization_invitations').get() as { token_hash: string }
    expect(row.token_hash).toBe(await hashInviteToken(token))
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(audits)).not.toContain(token)
  })

  it('accepts once for the invited address, joining with the role and team', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    const team = await createTeam(deps, ANN, value.id, 'Ops')
    await inviteMember(deps, ANN, value.id, { email: BOB.email, role: 'admin', teamId: team.value.id })
    const token = tokenFrom(mails[0])
    const preview = await previewInvite(deps, token)
    expect(preview.value).toMatchObject({ organizationName: 'Acme Co', role: 'admin', email: BOB.email, usable: true })
    const accepted = await acceptInvite(deps, BOB, token)
    expect(accepted.ok).toBe(true)
    expect((await deps.store.getMember(value.id, BOB.id))?.role).toBe('admin')
    expect(await deps.store.listTeamMembers(team.value.id)).toEqual([BOB.id])
    const again = await acceptInvite(deps, BOB, token)
    expect(again.ok).toBe(false)
    expect(again.code).toBe('invite_used')
    expect((await previewInvite(deps, token)).value.usable).toBe(false)
  })

  it('refuses a used invitation to anyone, including a second account holding the link', async () => {
    const { deps, orgId } = await acme()
    await inviteMember(deps, ANN, orgId, { email: EVE.email })
    const token = tokenFrom(mails[mails.length - 1])
    expect((await acceptInvite(deps, EVE, token)).ok).toBe(true)
    expect((await acceptInvite(deps, BOB, token)).code).toBe('invite_used')
    expect((await declineInvite(deps, EVE, token)).code).toBe('invite_used')
  })

  it('refuses an expired invitation and does not add a member', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    await inviteMember(deps, ANN, value.id, { email: BOB.email })
    const token = tokenFrom(mails[0])
    clock += 8 * 86_400_000
    const result = await acceptInvite(deps, BOB, token)
    expect(result.code).toBe('invite_expired')
    expect(await deps.store.getMember(value.id, BOB.id)).toBeNull()
    expect((await previewInvite(deps, token)).value.problem).toBe('invite_expired')
    expect(inviteProblem({ status: 'pending', expiresAt: 'garbage' }, clock)).toBe('expired')
  })

  it('the store refuses to claim an expired invitation even if the service check were skipped', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    await inviteMember(deps, ANN, value.id, { email: BOB.email })
    const row = (await deps.store.listInvites(value.id))[0]
    const later = new Date(clock + 30 * 86_400_000).toISOString()
    expect(await deps.store.resolveInvite(row.id, 'accepted', later, later)).toBe(false)
    expect(await deps.store.resolveInvite(row.id, 'accepted', new Date(clock).toISOString(), new Date(clock).toISOString())).toBe(true)
    expect(await deps.store.resolveInvite(row.id, 'accepted', new Date(clock).toISOString(), new Date(clock).toISOString())).toBe(false)
  })

  it('refuses the wrong account, signed-out callers, malformed and unknown tokens', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    await inviteMember(deps, ANN, value.id, { email: BOB.email })
    const token = tokenFrom(mails[0])
    expect((await acceptInvite(deps, EVE, token)).code).toBe('wrong_account')
    expect(await deps.store.getMember(value.id, EVE.id)).toBeNull()
    expect((await acceptInvite(deps, null, token)).code).toBe('signed_out')
    expect((await acceptInvite(deps, BOB, 'nonsense')).code).toBe('invite_invalid')
    expect((await acceptInvite(deps, BOB, generateInviteToken())).code).toBe('invite_invalid')
    expect((await previewInvite(deps, undefined)).code).toBe('invite_invalid')
    expect((await acceptInvite(deps, BOB, token)).ok).toBe(true)
  })

  it('decline and cancel end an invitation for good', async () => {
    const { deps, orgId } = await acme()
    await inviteMember(deps, ANN, orgId, { email: EVE.email })
    const eveToken = tokenFrom(mails[mails.length - 1])
    expect((await declineInvite(deps, EVE, eveToken)).ok).toBe(true)
    expect((await acceptInvite(deps, EVE, eveToken)).code).toBe('invite_used')

    await inviteMember(deps, ANN, orgId, { email: EVE.email })
    const second = mails[mails.length - 1]
    const pending = (await deps.store.listInvites(orgId)).find((i) => i.status === 'pending')
    expect((await cancelInvite(deps, CAL, orgId, pending.id)).code).toBe('forbidden')
    expect((await cancelInvite(deps, BOB, orgId, pending.id)).ok).toBe(true)
    expect((await acceptInvite(deps, EVE, tokenFrom(second))).code).toBe('invite_used')
    expect((await cancelInvite(deps, BOB, orgId, pending.id)).code).toBe('invite_used')
    expect((await cancelInvite(deps, BOB, orgId, 'nope')).code).toBe('not_found')
  })

  it('resend rotates the token and extends the expiry; the old link stops working', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    await inviteMember(deps, ANN, value.id, { email: BOB.email })
    const oldToken = tokenFrom(mails[0])
    const inviteId = (await deps.store.listInvites(value.id))[0].id
    clock += 6 * 86_400_000
    expect((await resendInvite(deps, ANN, value.id, inviteId)).ok).toBe(true)
    expect(mails).toHaveLength(2)
    const newToken = tokenFrom(mails[1])
    expect(newToken).not.toBe(oldToken)
    expect((await acceptInvite(deps, BOB, oldToken)).code).toBe('invite_invalid')
    clock += 3 * 86_400_000
    expect((await acceptInvite(deps, BOB, newToken)).ok).toBe(true)
    expect((await resendInvite(deps, ANN, value.id, inviteId)).code).toBe('invite_used')
  })

  it('does not invite a member or a duplicate, and validates the address, role and team', async () => {
    const { deps, orgId } = await acme()
    expect((await inviteMember(deps, ANN, orgId, { email: BOB.email })).code).toBe('already_member')
    expect((await inviteMember(deps, ANN, orgId, { email: 'new@example.com' })).ok).toBe(true)
    expect((await inviteMember(deps, ANN, orgId, { email: 'NEW@example.com' })).code).toBe('already_invited')
    expect((await inviteMember(deps, ANN, orgId, { email: 'not-an-email' })).code).toBe('invalid')
    expect((await inviteMember(deps, ANN, orgId, { email: 'a@example.com', role: 'ghost' })).code).toBe('invalid')
    const other = await createOrganization(deps, EVE, { name: 'Other Co' })
    const foreignTeam = await createTeam(deps, EVE, other.value.id, 'Theirs')
    expect((await inviteMember(deps, ANN, orgId, { email: 'a@example.com', teamId: foreignTeam.value.id })).code).toBe('invalid')
  })

  it('a pending invitation to one organisation cannot be cancelled or resent through another', async () => {
    const { deps, orgId } = await acme()
    const other = await createOrganization(deps, EVE, { name: 'Other Co' })
    await inviteMember(deps, ANN, orgId, { email: 'new@example.com' })
    const invite = (await deps.store.listInvites(orgId))[0]
    expect((await cancelInvite(deps, EVE, other.value.id, invite.id)).code).toBe('not_found')
    expect((await resendInvite(deps, EVE, other.value.id, invite.id)).code).toBe('not_found')
  })

  it('reports an email failure but keeps the invitation so it can be resent', async () => {
    const deps = makeDeps()
    const { value } = await createOrganization(deps, ANN, { name: 'Acme Co' })
    mailWorks = false
    const sent = await inviteMember(deps, ANN, value.id, { email: BOB.email })
    expect(sent.ok).toBe(true)
    expect(sent.value.emailSent).toBe(false)
    expect(sent.message).toMatch(/could not be sent/)
    mailWorks = true
    expect((await resendInvite(deps, ANN, value.id, sent.value.id)).value.emailSent).toBe(true)
  })

  it('rate limits invitation sends before revealing anything about the address', async () => {
    const { deps, orgId } = await acme()
    allowSends = false
    const blocked = await inviteMember(deps, ANN, orgId, { email: BOB.email })
    expect(blocked.code).toBe('rate_limited')
    expect(blocked.code).not.toBe('already_member')
    expect((await resendInvite(deps, ANN, orgId, 'whatever')).code).toBe('not_found')
    expect(mails).toHaveLength(2)
  })

  it('the real per-minute limiter used by the wiring allows ten sends then blocks', () => {
    const results = Array.from({ length: 12 }, () => hit('org-invite:1', 10).limited)
    expect(results.filter(Boolean)).toHaveLength(2)
    expect(results.slice(0, 10).some(Boolean)).toBe(false)
  })
})

describe('policy helpers', () => {
  it('normalises slugs, logos and metadata', () => {
    expect(normaliseSlug('  Hello, World!! ')).toBe('hello-world')
    expect(normaliseSlug('new')).toBeNull()
    expect(normaliseSlug('!')).toBeNull()
    expect(normaliseLogo('/img/a.png')).toEqual({ ok: true, value: '/img/a.png' })
    expect(normaliseLogo('//evil.test/a.png').ok).toBe(false)
    expect(normaliseLogo('data:image/png;base64,AAAA').ok).toBe(false)
    expect(normaliseLogo(undefined)).toEqual({ ok: true, value: null })
    expect(normaliseMetadata('{"a":1}')).toEqual({ ok: true, value: '{"a":1}' })
    expect(normaliseMetadata('{bad').ok).toBe(false)
    expect(normaliseMetadata({ big: 'x'.repeat(5000) }).ok).toBe(false)
  })

  it('makes unguessable, well-formed tokens', async () => {
    const a = generateInviteToken()
    const b = generateInviteToken()
    expect(a).not.toBe(b)
    expect(isInviteTokenShape(a)).toBe(true)
    expect(isInviteTokenShape(`${a}x`)).toBe(false)
    expect(await hashInviteToken(a)).toHaveLength(64)
  })
})

describe('teams', () => {
  it('creates, assigns and deletes teams only within the organisation', async () => {
    const { deps, orgId } = await acme()
    const team = await createTeam(deps, BOB, orgId, 'Ops')
    expect(team.ok).toBe(true)
    expect((await createTeam(deps, BOB, orgId, 'Ops')).ok).toBe(false)
    expect((await setTeamMembership(deps, BOB, orgId, team.value.id, CAL.id, true)).ok).toBe(true)
    expect((await setTeamMembership(deps, BOB, orgId, team.value.id, EVE.id, true)).code).toBe('not_found')
    const detail = await getOrganization(deps, CAL, orgId)
    expect(detail.value.teams[0]).toMatchObject({ name: 'Ops', memberCount: 1, memberIds: [CAL.id] })
    const other = await createOrganization(deps, EVE, { name: 'Other Co' })
    expect((await deleteTeam(deps, EVE, other.value.id, team.value.id)).code).toBe('not_found')
    expect((await setTeamMembership(deps, BOB, orgId, team.value.id, CAL.id, false)).ok).toBe(true)
    expect((await deleteTeam(deps, CAL, orgId, team.value.id)).code).toBe('forbidden')
    expect((await deleteTeam(deps, BOB, orgId, team.value.id)).ok).toBe(true)
  })
})

describe('active organisation', () => {
  it('honours the remembered organisation only while the account is a member', async () => {
    const { deps, orgId } = await acme()
    const second = await createOrganization(deps, CAL, { name: 'Zed Co' })
    expect((await resolveActiveOrganization(deps, CAL.id, second.value.id))?.id).toBe(second.value.id)
    expect((await resolveActiveOrganization(deps, CAL.id, orgId))?.id).toBe(orgId)
    expect((await resolveActiveOrganization(deps, CAL.id, 'someone-elses'))?.name).toBe('Acme Co')
    expect(await resolveActiveOrganization(deps, EVE.id, orgId)).toBeNull()
    expect(await resolveActiveOrganization(deps, null, orgId)).toBeNull()
    await removeMember(deps, ANN, orgId, CAL.id)
    expect((await resolveActiveOrganization(deps, CAL.id, orgId))?.id).toBe(second.value.id)
    expect(await resolveActiveOrganization({ ...deps, settings: { ...settings, enabled: false } }, CAL.id, orgId)).toBeNull()
  })
})

describe('organisation-only content', () => {
  it('shows a restricted document only to members of its organisation', async () => {
    const { orgId } = await acme()
    const other = await createOrganization(makeDeps(), EVE, { name: 'Other Co' })
    expect(await viewerMayRead(d1, 'pages', 5, null)).toBe(true)
    await setOrgVisibility(d1, 'pages', 5, orgId, '2026-11-24T00:00:00.000Z')
    expect(await getOrgVisibility(d1, 'pages', 5)).toBe(orgId)
    expect(await viewerMayRead(d1, 'pages', 5, null)).toBe(false)
    expect(await viewerMayRead(d1, 'pages', 5, EVE.id)).toBe(false)
    for (const member of [ANN, BOB, CAL]) expect(await viewerMayRead(d1, 'pages', 5, member.id)).toBe(true)
    expect(await viewerMayRead(d1, 'posts', 5, null)).toBe(true)
    await setOrgVisibility(d1, 'pages', 5, other.value.id, '2026-11-24T00:00:00.000Z')
    expect(await viewerMayRead(d1, 'pages', 5, EVE.id)).toBe(true)
    expect(await viewerMayRead(d1, 'pages', 5, ANN.id)).toBe(false)
    expect([...(await listOrgRestrictedIds(d1, 'pages'))]).toEqual([5])
    await clearOrgVisibility(d1, 'pages', 5)
    expect(await viewerMayRead(d1, 'pages', 5, null)).toBe(true)
    expect((await listOrgRestrictedIds(d1, 'pages')).size).toBe(0)
  })

  it('stops admitting someone the moment they leave the organisation', async () => {
    const { deps, orgId } = await acme()
    await setOrgVisibility(d1, 'events', 9, orgId, '2026-11-24T00:00:00.000Z')
    expect(await viewerMayRead(d1, 'events', 9, CAL.id)).toBe(true)
    await removeMember(deps, ANN, orgId, CAL.id)
    expect(await viewerMayRead(d1, 'events', 9, CAL.id)).toBe(false)
  })
})
