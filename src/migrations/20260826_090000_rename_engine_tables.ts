import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

import { applyEngineRenames, dropEmptyLegacyTables, type EngineDb } from './schema/engineBootstrap'

// Finishes the eg_ rename: the engine's own bookkeeping tables, and the
// relationship columns that had to move with the collections they point at.
//
// Most of the work has usually happened already, because the same sequence
// runs as a pre-step (scripts/prepareEngineTables.mts, wired into
// `deploy:database`) and inside /api/internal-migrate. It is repeated here so
// that a database brought up purely by replaying this chain still ends up in
// the right shape - on a fresh database the initial migration's frozen SQL
// recreates the old-named tables, and this is what cleans them up.
//
// Note what is NOT here: the migration-history table itself. The runner reads
// that table before any migration executes, so it has to be renamed before the
// runner starts - see the header of ./schema/engineBootstrap.ts.
//
// Idempotent throughout: a table moves only when the old name is present and
// the new one is not, a column likewise, and a leftover is dropped only when
// it is provably empty.

export async function up({ db, payload: engine }: MigrateUpArgs): Promise<void> {
  const exists = async (table: string): Promise<boolean> => {
    const rows = (await db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
    )) as { name: string }[]
    return rows.length > 0
  }

  const handle: EngineDb = {
    exists,
    listTables: async () => {
      const rows = (await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table'`,
      )) as { name: string }[]
      return rows.map((row) => row.name)
    },
    columnsOf: async (table) => {
      if (!(await exists(table))) return []
      const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
      return rows.map((row) => row.name)
    },
    run: (statement) => db.run(sql.raw(statement)),
    countRows: async (table) => {
      const rows = (await db.all(
        sql.raw(`SELECT COUNT(*) AS n FROM \`${table}\``),
      )) as { n: number }[]
      return rows[0]?.n ?? 0
    },
  }

  await applyEngineRenames(handle)

  const { dropped, kept } = await dropEmptyLegacyTables(handle)

  if (dropped.length > 0) {
    engine.logger.info(`[migrate] Dropped empty legacy tables: ${dropped.join(', ')}`)
  }
  for (const leftover of kept) {
    engine.logger.warn(
      `[migrate] Left \`${leftover.table}\` in place - it still holds ${leftover.rows} row(s). Inspect it before removing.`,
    )
  }
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here: the running config asks for the
  // new names, so undoing the rename would break the site rather than repair it.
  engine.logger.info('[migrate] Down is a no-op - the eg_ engine table names are left in place.')
}
