import type { D1Database } from '@cloudflare/workers-types'

export interface Migration {
  name: string
  up: (db: D1Database) => Promise<void>
  down: (db: D1Database) => Promise<void>
}

const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: async (db) => {
      // Tables will be created by the schema setup
      // This migration is a placeholder for tracking
    },
    down: async (db) => {
      // Rollback would drop tables
    },
  },
  {
    name: '002_add_roles_table',
    up: async (db) => {
      await db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          permissions TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
        )
        .run()
    },
    down: async (db) => {
      await db.prepare('DROP TABLE IF EXISTS roles').run()
    },
  },
  {
    name: '003_add_user_roles',
    up: async (db) => {
      await db
        .prepare(
          `
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'
      `,
        )
        .run()
    },
    down: async (db) => {
      // SQLite doesn't support dropping columns easily
      // This is a known limitation
    },
  },
  {
    name: '004_add_edit_locks',
    up: async (db) => {
      await db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS edit_locks (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          user_id TEXT NOT NULL,
          acquired_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          UNIQUE(resource_id, resource_type)
        )
      `,
        )
        .run()
    },
    down: async (db) => {
      await db.prepare('DROP TABLE IF EXISTS edit_locks').run()
    },
  },
]

export async function runMigrations(
  db: D1Database,
  upTo?: string,
): Promise<void> {
  const migrationsToRun = upTo
    ? migrations.filter((m) => migrations.indexOf(m) <= migrations.findIndex((m) => m.name === upTo))
    : migrations

  for (const migration of migrationsToRun) {
    try {
      await migration.up(db)
      console.log(`✓ Migration ${migration.name} completed`)
    } catch (error) {
      console.error(`✗ Migration ${migration.name} failed:`, error)
      throw error
    }
  }
}

export async function rollbackMigrations(
  db: D1Database,
  downTo?: string,
): Promise<void> {
  const migrationsToRollback = downTo
    ? migrations.reverse().filter((m) => migrations.indexOf(m) >= migrations.findIndex((m) => m.name === downTo))
    : migrations.reverse()

  for (const migration of migrationsToRollback) {
    try {
      await migration.down(db)
      console.log(`✓ Rollback ${migration.name} completed`)
    } catch (error) {
      console.error(`✗ Rollback ${migration.name} failed:`, error)
      throw error
    }
  }
}
