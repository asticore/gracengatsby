import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirrors of the organisation tables (hand-migrated: see
 * src/migrations/20261124_100000_organizations.ts). Rows are written with bound
 * statements by src/features/organizations/store.ts, so these are declared directly
 * rather than through generateTable. Names must keep matching the migration.
 * Invitations hold only the SHA-256 of the token, never the token.
 */
export const organizations = sqliteTable(
  'eg_organizations',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    metadata: text('metadata'),
    createdBy: integer('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('eg_organizations_slug_idx').on(table.slug)],
)

export const organizationMembers = sqliteTable(
  'eg_organization_members',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id').notNull(),
    userId: integer('user_id').notNull(),
    role: text('role').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('eg_organization_members_unique_idx').on(table.organizationId, table.userId), index('eg_organization_members_user_idx').on(table.userId)],
)

export const organizationRoles = sqliteTable(
  'eg_organization_roles',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    permissions: text('permissions').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('eg_organization_roles_unique_idx').on(table.organizationId, table.name)],
)

export const organizationTeams = sqliteTable(
  'eg_organization_teams',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('eg_organization_teams_unique_idx').on(table.organizationId, table.name)],
)

export const organizationTeamMembers = sqliteTable(
  'eg_organization_team_members',
  {
    teamId: text('team_id').notNull(),
    userId: integer('user_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] }), index('eg_organization_team_members_user_idx').on(table.userId)],
)

export const organizationInvitations = sqliteTable(
  'eg_organization_invitations',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    teamId: text('team_id'),
    tokenHash: text('token_hash').notNull(),
    status: text('status').notNull().default('pending'),
    inviterId: integer('inviter_id').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
    lastSentAt: text('last_sent_at').notNull(),
  },
  (table) => [
    uniqueIndex('eg_organization_invitations_token_idx').on(table.tokenHash),
    index('eg_organization_invitations_org_idx').on(table.organizationId),
    index('eg_organization_invitations_email_idx').on(table.email),
  ],
)

export const contentOrgVisibility = sqliteTable(
  'eg_content_org_visibility',
  {
    collection: text('collection').notNull(),
    docId: integer('doc_id').notNull(),
    organizationId: text('organization_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.collection, table.docId] }), index('eg_content_org_visibility_org_idx').on(table.organizationId)],
)
