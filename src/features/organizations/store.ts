import { resolveD1Binding } from '@/cms/db/connect'

import type { OrgPermissionStore } from './permissions'
import type { InviteRow, MemberRow, OrgRow, OrgStore, RoleRow, TeamRow } from './types'

/**
 * The real organisation tables, behind a D1-shaped handle so tests can run the
 * same SQL on SQLite. Server-only. Bound statements only; the guards that keep
 * the last owner and single-use invitations safe are in the SQL itself, so two
 * simultaneous requests cannot both pass.
 */

export type D1Like = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<{ meta?: { changes?: number } } | unknown>
      all: () => Promise<{ results?: unknown[] }>
      first: () => Promise<unknown>
    }
  }
}

const changes = (result: unknown): number => Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0)

type RawOrg = { id: string; name: string; slug: string; logo: string | null; metadata: string | null; created_by: number; created_at: string; updated_at: string }
type RawMember = { id: string; organization_id: string; user_id: number; role: string; created_at: string }
type RawTeam = { id: string; organization_id: string; name: string; created_at: string }
type RawInvite = {
  id: string
  organization_id: string
  email: string
  role: string
  team_id: string | null
  token_hash: string
  status: string
  inviter_id: number
  expires_at: string
  created_at: string
  resolved_at: string | null
  last_sent_at: string
}

const org = (r: RawOrg): OrgRow => ({ id: r.id, name: r.name, slug: r.slug, logo: r.logo, metadata: r.metadata, createdBy: Number(r.created_by), createdAt: r.created_at, updatedAt: r.updated_at })
const member = (r: RawMember): MemberRow => ({ id: r.id, organizationId: r.organization_id, userId: Number(r.user_id), role: r.role, createdAt: r.created_at })
const team = (r: RawTeam): TeamRow => ({ id: r.id, organizationId: r.organization_id, name: r.name, createdAt: r.created_at })
const invite = (r: RawInvite): InviteRow => ({
  id: r.id,
  organizationId: r.organization_id,
  email: r.email,
  role: r.role,
  teamId: r.team_id,
  tokenHash: r.token_hash,
  status: r.status as InviteRow['status'],
  inviterId: Number(r.inviter_id),
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  lastSentAt: r.last_sent_at,
})

const permissionsOf = (text: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(text)) as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function createD1OrgStore(getD1: () => Promise<D1Like>): OrgStore {
  const run = async (query: string, ...values: unknown[]) => (await getD1()).prepare(query).bind(...values).run()
  const all = async <T>(query: string, ...values: unknown[]): Promise<T[]> => ((await (await getD1()).prepare(query).bind(...values).all()).results ?? []) as T[]
  const first = async <T>(query: string, ...values: unknown[]): Promise<T | null> => ((await (await getD1()).prepare(query).bind(...values).first()) as T | null) ?? null

  return {
    async insertOrg(row) {
      await run(
        'INSERT INTO `eg_organizations` (id, name, slug, logo, metadata, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        row.id, row.name, row.slug, row.logo, row.metadata, row.createdBy, row.createdAt, row.updatedAt,
      )
    },
    async getOrg(id) {
      const r = await first<RawOrg>('SELECT * FROM `eg_organizations` WHERE id = ? LIMIT 1', id)
      return r ? org(r) : null
    },
    async getOrgBySlug(slug) {
      const r = await first<RawOrg>('SELECT * FROM `eg_organizations` WHERE slug = ? LIMIT 1', slug)
      return r ? org(r) : null
    },
    async updateOrg(id, patch, at) {
      const sets: string[] = []
      const values: unknown[] = []
      for (const [column, key] of [['name', 'name'], ['slug', 'slug'], ['logo', 'logo'], ['metadata', 'metadata']] as const) {
        if (key in patch) {
          sets.push(`${column} = ?`)
          values.push((patch as Record<string, unknown>)[key] ?? null)
        }
      }
      sets.push('updated_at = ?')
      await run(`UPDATE \`eg_organizations\` SET ${sets.join(', ')} WHERE id = ?`, ...values, at, id)
    },
    async deleteOrg(id) {
      await run('DELETE FROM `eg_organization_team_members` WHERE team_id IN (SELECT id FROM `eg_organization_teams` WHERE organization_id = ?)', id)
      for (const table of ['eg_organization_teams', 'eg_organization_members', 'eg_organization_invitations', 'eg_organization_roles', 'eg_content_org_visibility']) {
        await run(`DELETE FROM \`${table}\` WHERE organization_id = ?`, id)
      }
      await run('DELETE FROM `eg_organizations` WHERE id = ?', id)
    },
    async listOrgsForUser(userId) {
      const rows = await all<RawOrg & { member_role: string }>(
        'SELECT o.*, m.role AS member_role FROM `eg_organizations` o JOIN `eg_organization_members` m ON m.organization_id = o.id WHERE m.user_id = ? ORDER BY o.name',
        userId,
      )
      return rows.map((r) => ({ ...org(r), role: r.member_role }))
    },
    async countOwnedBy(userId) {
      const r = await first<{ n: number }>("SELECT COUNT(*) AS n FROM `eg_organization_members` WHERE user_id = ? AND role = 'owner'", userId)
      return Number(r?.n ?? 0)
    },
    async listAllOrgs(limit) {
      const rows = await all<RawOrg & { member_count: number }>(
        'SELECT o.*, (SELECT COUNT(*) FROM `eg_organization_members` m WHERE m.organization_id = o.id) AS member_count FROM `eg_organizations` o ORDER BY o.created_at DESC LIMIT ?',
        Math.max(1, Math.min(500, limit)),
      )
      return rows.map((r) => ({ ...org(r), memberCount: Number(r.member_count) }))
    },

    async getMember(orgId, userId) {
      const r = await first<RawMember>('SELECT * FROM `eg_organization_members` WHERE organization_id = ? AND user_id = ? LIMIT 1', orgId, userId)
      return r ? member(r) : null
    },
    async listMembers(orgId) {
      return (await all<RawMember>('SELECT * FROM `eg_organization_members` WHERE organization_id = ? ORDER BY created_at, id', orgId)).map(member)
    },
    async insertMember(row) {
      const result = await run(
        'INSERT OR IGNORE INTO `eg_organization_members` (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
        row.id, row.organizationId, row.userId, row.role, row.createdAt,
      )
      return changes(result) > 0
    },
    async setMemberRole(orgId, userId, role) {
      const result = await run(
        `UPDATE \`eg_organization_members\` SET role = ?
         WHERE organization_id = ? AND user_id = ?
           AND (role <> 'owner' OR ? = 'owner' OR (SELECT COUNT(*) FROM \`eg_organization_members\` WHERE organization_id = ? AND role = 'owner') > 1)`,
        role, orgId, userId, role, orgId,
      )
      return changes(result) > 0
    },
    async removeMember(orgId, userId) {
      const result = await run(
        `DELETE FROM \`eg_organization_members\`
         WHERE organization_id = ? AND user_id = ?
           AND (role <> 'owner' OR (SELECT COUNT(*) FROM \`eg_organization_members\` WHERE organization_id = ? AND role = 'owner') > 1)`,
        orgId, userId, orgId,
      )
      if (changes(result) === 0) return false
      await run('DELETE FROM `eg_organization_team_members` WHERE user_id = ? AND team_id IN (SELECT id FROM `eg_organization_teams` WHERE organization_id = ?)', userId, orgId)
      return true
    },
    async countMembersWithRole(orgId, role) {
      const r = await first<{ n: number }>('SELECT COUNT(*) AS n FROM `eg_organization_members` WHERE organization_id = ? AND role = ?', orgId, role)
      return Number(r?.n ?? 0)
    },

    async insertTeam(row) {
      const result = await run('INSERT OR IGNORE INTO `eg_organization_teams` (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)', row.id, row.organizationId, row.name, row.createdAt)
      return changes(result) > 0
    },
    async getTeam(id) {
      const r = await first<RawTeam>('SELECT * FROM `eg_organization_teams` WHERE id = ? LIMIT 1', id)
      return r ? team(r) : null
    },
    async listTeams(orgId) {
      const rows = await all<RawTeam & { member_count: number }>(
        'SELECT t.*, (SELECT COUNT(*) FROM `eg_organization_team_members` tm WHERE tm.team_id = t.id) AS member_count FROM `eg_organization_teams` t WHERE t.organization_id = ? ORDER BY t.name',
        orgId,
      )
      return rows.map((r) => ({ ...team(r), memberCount: Number(r.member_count) }))
    },
    async deleteTeam(id) {
      await run('DELETE FROM `eg_organization_team_members` WHERE team_id = ?', id)
      await run('DELETE FROM `eg_organization_teams` WHERE id = ?', id)
    },
    async addTeamMember(teamId, userId, at) {
      await run('INSERT OR IGNORE INTO `eg_organization_team_members` (team_id, user_id, created_at) VALUES (?, ?, ?)', teamId, userId, at)
    },
    async removeTeamMember(teamId, userId) {
      await run('DELETE FROM `eg_organization_team_members` WHERE team_id = ? AND user_id = ?', teamId, userId)
    },
    async listTeamMembers(teamId) {
      return (await all<{ user_id: number }>('SELECT user_id FROM `eg_organization_team_members` WHERE team_id = ? ORDER BY created_at', teamId)).map((r) => Number(r.user_id))
    },

    async listRoles(orgId) {
      const rows = await all<{ id: string; organization_id: string; name: string; permissions: string; created_at: string }>('SELECT * FROM `eg_organization_roles` WHERE organization_id = ? ORDER BY name', orgId)
      return rows.map((r) => ({ id: r.id, organizationId: r.organization_id, name: r.name, permissions: permissionsOf(r.permissions), createdAt: r.created_at }))
    },
    async getRole(orgId, name) {
      const r = await first<{ id: string; organization_id: string; name: string; permissions: string; created_at: string }>('SELECT * FROM `eg_organization_roles` WHERE organization_id = ? AND name = ? LIMIT 1', orgId, name)
      return r ? ({ id: r.id, organizationId: r.organization_id, name: r.name, permissions: permissionsOf(r.permissions), createdAt: r.created_at } as RoleRow) : null
    },
    async upsertRole(row) {
      await run(
        `INSERT INTO \`eg_organization_roles\` (id, organization_id, name, permissions, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(organization_id, name) DO UPDATE SET permissions = excluded.permissions`,
        row.id, row.organizationId, row.name, JSON.stringify(row.permissions), row.createdAt,
      )
    },
    async deleteRole(orgId, name) {
      await run('DELETE FROM `eg_organization_roles` WHERE organization_id = ? AND name = ?', orgId, name)
    },
    async countMembersWithRoleName(orgId, name) {
      const r = await first<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM \`eg_organization_members\` WHERE organization_id = ? AND role = ?)
              + (SELECT COUNT(*) FROM \`eg_organization_invitations\` WHERE organization_id = ? AND role = ? AND status = 'pending') AS n`,
        orgId, name, orgId, name,
      )
      return Number(r?.n ?? 0)
    },

    async insertInvite(row) {
      await run(
        `INSERT INTO \`eg_organization_invitations\` (id, organization_id, email, role, team_id, token_hash, status, inviter_id, expires_at, created_at, resolved_at, last_sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.organizationId, row.email, row.role, row.teamId, row.tokenHash, row.status, row.inviterId, row.expiresAt, row.createdAt, row.resolvedAt, row.lastSentAt,
      )
    },
    async getInvite(id) {
      const r = await first<RawInvite>('SELECT * FROM `eg_organization_invitations` WHERE id = ? LIMIT 1', id)
      return r ? invite(r) : null
    },
    async getInviteByTokenHash(hash) {
      const r = await first<RawInvite>('SELECT * FROM `eg_organization_invitations` WHERE token_hash = ? LIMIT 1', hash)
      return r ? invite(r) : null
    },
    async listInvites(orgId) {
      return (await all<RawInvite>('SELECT * FROM `eg_organization_invitations` WHERE organization_id = ? ORDER BY created_at DESC LIMIT 200', orgId)).map(invite)
    },
    async findPendingInvite(orgId, email) {
      const r = await first<RawInvite>("SELECT * FROM `eg_organization_invitations` WHERE organization_id = ? AND email = ? AND status = 'pending' LIMIT 1", orgId, email)
      return r ? invite(r) : null
    },
    async resolveInvite(id, status, at, now) {
      // A cancel may close an expired invitation; accept and decline may not.
      const result =
        status === 'canceled'
          ? await run("UPDATE `eg_organization_invitations` SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'", status, at, id)
          : await run("UPDATE `eg_organization_invitations` SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending' AND expires_at > ?", status, at, id, now)
      return changes(result) > 0
    },
    async refreshInvite(id, tokenHash, expiresAt, at) {
      const result = await run("UPDATE `eg_organization_invitations` SET token_hash = ?, expires_at = ?, last_sent_at = ? WHERE id = ? AND status = 'pending'", tokenHash, expiresAt, at, id)
      return changes(result) > 0
    },
  }
}

const liveD1 = async (): Promise<D1Like> => (await resolveD1Binding()) as unknown as D1Like

export const defaultOrgStore: OrgStore = createD1OrgStore(liveD1)

/** The two reads `hasOrgPermission` needs, on the live database. */
export const defaultOrgPermissionStore: OrgPermissionStore = {
  async getMemberRole(orgId, userId) {
    return (await defaultOrgStore.getMember(orgId, userId))?.role ?? null
  },
  async getCustomRole(orgId, name) {
    return (await defaultOrgStore.getRole(orgId, name))?.permissions ?? null
  },
}
