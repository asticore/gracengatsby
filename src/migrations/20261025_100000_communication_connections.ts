import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'
import { COMMUNICATIONS_COLUMNS, COPY_PAIRS, decideCopy } from '@/features/email/connectionMigrate'

// Wave 16: provider keys move from the Email settings global to the
// communications group of Integrations, and the SMS settings are added beside
// them. Idempotent: a column is added only when PRAGMA table_info says it is
// missing, and a value is copied only into a blank new column (decideCopy).
// Old Email settings columns are left in place - the send path still reads
// them as a fallback when the new value is blank.

type Runner = MigrateUpArgs['db']
type Row = Record<string, unknown>

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const integrations = await columnsOf(db, 'eg_integrations')
  if (integrations.size === 0) return // no table yet: nothing to extend

  for (const column of COMMUNICATIONS_COLUMNS) {
    if (integrations.has(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`eg_integrations\` ADD COLUMN \`${column}\` text`))
  }

  // Copy old values across. With no row on either side there is nothing to copy;
  // the send path falls back to the old fields in that case anyway.
  const email = (await columnsOf(db, 'eg_email_settings')).size > 0
    ? ((await db.all(sql.raw('SELECT * FROM `eg_email_settings` ORDER BY `id` LIMIT 1'))) as Row[])[0]
    : undefined
  const target = (await db.all(sql.raw('SELECT * FROM `eg_integrations` ORDER BY `id` LIMIT 1'))) as Row[]
  const integrationsRow = target[0]

  if (email && integrationsRow) {
    const assignments: string[] = []
    for (const { from, to } of COPY_PAIRS) {
      const value = decideCopy(integrationsRow[to], email[from])
      if (value !== null) assignments.push(`\`${to}\` = ${quote(value)}`)
    }
    if (assignments.length > 0) {
      await db.run(sql.raw(`UPDATE \`eg_integrations\` SET ${assignments.join(', ')} WHERE \`id\` = ${Number(integrationsRow.id)}`))
    }
  }

  engine.logger.info('[migrate] communication connections columns ensured and existing keys copied.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here: keys an operator saved cannot be rebuilt.
}
