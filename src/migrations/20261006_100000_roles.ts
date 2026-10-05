import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'
import { BUILT_IN_ROLES } from '@/features/roles/permissions'

// Creates the `eg_roles` collection table for managing user roles and permissions.
//
// Written by hand rather than generated, for the same reason other migrations are:
// the CLI's `migrate` cannot reach production D1 from this CI environment (see the
// note on the D1 binding in wrangler.jsonc), so every statement has to be safe to
// replay against a database that may already have them. `CREATE TABLE IF NOT EXISTS`
// covers the table; SQLite has no `ADD COLUMN IF NOT EXISTS`, so the one column add
// swallows the duplicate-column error instead - see `addColumn`.
//
// The column names here and the field names on the collection are two halves of
// one thing. Change one, change both.

const ROLES = `CREATE TABLE IF NOT EXISTS \`eg_roles\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`slug\` text NOT NULL,
  \`description\` text,
  \`built_in\` integer DEFAULT 0,
  \`permissions\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  UNIQUE(\`slug\`)
)`

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_roles_slug_idx` ON `eg_roles` (`slug`)',
  'CREATE INDEX IF NOT EXISTS `eg_roles_created_at_idx` ON `eg_roles` (`created_at`)',
]

type Runner = MigrateUpArgs['db']

/**
 * Adds a column, treating "it is already there" as success.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and this migration has to be safe
 * to replay - production runs it through an HTTP endpoint that can be called
 * twice. Only the duplicate-column error is swallowed; anything else still
 * fails the migration, because a silently skipped schema change is how a table
 * ends up half-built with nobody knowing.
 */
const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(ROLES))
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }

  // Add custom_role_id column to users table
  await addColumn(db, 'eg_users', 'custom_role_id', 'integer')

  // Every registered collection needs a column here or the admin's document
  // locking fails on the first edit - the join table is one wide row of
  // per-collection foreign keys and the engine writes to whichever one matches.
  await addColumn(db, 'eg_locked_documents_rels', 'eg_roles_id', 'integer')
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_roles_id_idx` ON `eg_locked_documents_rels` (`eg_roles_id`)',
    ),
  )

  // Seed the 4 built-in roles (idempotent with INSERT OR IGNORE)
  const now = new Date().toISOString()
  const builtInRoles = [
    { name: 'Admin', slug: 'admin' },
    { name: 'Editor', slug: 'editor' },
    { name: 'Viewer', slug: 'viewer' },
    { name: 'Customer', slug: 'customer' },
  ]

  for (const role of builtInRoles) {
    const permissions = JSON.stringify(BUILT_IN_ROLES[role.slug] || {})
    const escapedPermissions = permissions.replace(/'/g, "''")
    await db.run(
      sql.raw(
        `INSERT OR IGNORE INTO \`eg_roles\` (\`name\`, \`slug\`, \`built_in\`, \`permissions\`, \`created_at\`, \`updated_at\`)
         VALUES ('${role.name}', '${role.slug}', 1, '${escapedPermissions}', '${now}', '${now}')`,
      ),
    )
  }

  engine.logger.info('[migrate] eg_roles table created and built-in roles seeded.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here.
  engine.logger.info('[migrate] Down is a no-op - the roles table is left in place.')
}
