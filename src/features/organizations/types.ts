/** Shared shapes for organisations. Flat on purpose: this project compiles with `strictNullChecks` off, where unions keyed on a boolean do not narrow. */

export type OrgRow = {
  id: string
  name: string
  slug: string
  logo: string | null
  /** JSON object as text. */
  metadata: string | null
  createdBy: number
  createdAt: string
  updatedAt: string
}

export type MemberRow = { id: string; organizationId: string; userId: number; role: string; createdAt: string }

export type TeamRow = { id: string; organizationId: string; name: string; createdAt: string }

export type RoleRow = { id: string; organizationId: string; name: string; permissions: string[]; createdAt: string }

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'canceled'

export type InviteRow = {
  id: string
  organizationId: string
  email: string
  role: string
  teamId: string | null
  tokenHash: string
  status: InviteStatus
  inviterId: number
  expiresAt: string
  createdAt: string
  resolvedAt: string | null
  lastSentAt: string
}

export type OrgSummary = OrgRow & { memberCount: number }

export type OrgStore = {
  insertOrg: (row: OrgRow) => Promise<void>
  getOrg: (id: string) => Promise<OrgRow | null>
  getOrgBySlug: (slug: string) => Promise<OrgRow | null>
  updateOrg: (id: string, patch: { name?: string; slug?: string; logo?: string | null; metadata?: string | null }, at: string) => Promise<void>
  /** Removes the organisation and everything that hangs off it. */
  deleteOrg: (id: string) => Promise<void>
  listOrgsForUser: (userId: number) => Promise<(OrgRow & { role: string })[]>
  countOwnedBy: (userId: number) => Promise<number>
  /** Every organisation with its member count, newest first. For the admin screen. */
  listAllOrgs: (limit: number) => Promise<OrgSummary[]>

  getMember: (orgId: string, userId: number) => Promise<MemberRow | null>
  listMembers: (orgId: string) => Promise<MemberRow[]>
  /** Inserts unless the account is already a member. Returns whether a row was added. */
  insertMember: (row: MemberRow) => Promise<boolean>
  /** Changes a role. Refuses (false) when it would demote the organisation's last owner. */
  setMemberRole: (orgId: string, userId: number, role: string) => Promise<boolean>
  /** Removes a member and their team seats. Refuses (false) when they are the last owner. */
  removeMember: (orgId: string, userId: number) => Promise<boolean>
  countMembersWithRole: (orgId: string, role: string) => Promise<number>

  insertTeam: (row: TeamRow) => Promise<boolean>
  getTeam: (id: string) => Promise<TeamRow | null>
  listTeams: (orgId: string) => Promise<(TeamRow & { memberCount: number })[]>
  deleteTeam: (id: string) => Promise<void>
  addTeamMember: (teamId: string, userId: number, at: string) => Promise<void>
  removeTeamMember: (teamId: string, userId: number) => Promise<void>
  listTeamMembers: (teamId: string) => Promise<number[]>

  listRoles: (orgId: string) => Promise<RoleRow[]>
  getRole: (orgId: string, name: string) => Promise<RoleRow | null>
  upsertRole: (row: RoleRow) => Promise<void>
  deleteRole: (orgId: string, name: string) => Promise<void>
  countMembersWithRoleName: (orgId: string, name: string) => Promise<number>

  insertInvite: (row: InviteRow) => Promise<void>
  getInvite: (id: string) => Promise<InviteRow | null>
  getInviteByTokenHash: (hash: string) => Promise<InviteRow | null>
  listInvites: (orgId: string) => Promise<InviteRow[]>
  findPendingInvite: (orgId: string, email: string) => Promise<InviteRow | null>
  /** Moves a pending invitation to a final state. Returns false when it was no longer pending or had expired. Single use is decided here, in one statement. */
  resolveInvite: (id: string, status: 'accepted' | 'declined' | 'canceled', at: string, now: string) => Promise<boolean>
  /** Rotates the token and expiry of a pending invitation. */
  refreshInvite: (id: string, tokenHash: string, expiresAt: string, at: string) => Promise<boolean>
}
