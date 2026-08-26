/**
 * Generates src/migrations/schema/tableRenames.ts - the old -> new table name
 * mapping for the `eg_` (Engage) table prefix rename.
 *
 * Run it with:
 *
 *   NODE_OPTIONS=--no-deprecation PAYLOAD_SECRET=ignore \
 *     npx tsx scripts/generateTableRenames.mts
 *
 * It needs two inputs and derives everything else:
 *
 *   1. The config (src/engage.config.ts) - every collection and global now
 *      carries an explicit `dbName`, which is the NEW parent table name. The
 *      OLD parent name is the same slug in snake_case, optionally with the
 *      retired `ac_` prefix; which of the two it was is decided by looking at
 *      what actually exists in the database, never by guessing.
 *
 *   2. The local emulated D1 (.wrangler/state/v3/d1/miniflare-D1DatabaseObject),
 *      which tracks the same migration state as production, read through
 *      `wrangler d1 execute D1 --local`. This supplies the real, complete table
 *      list - including every child table (blocks, arrays, `_rels`) and every
 *      version table (`_<t>_v`, `_<t>_v_rels`) that the engine derives from a
 *      parent.
 *
 * Child and version tables are never listed by hand. Each one is matched to the
 * longest OLD parent name it starts from and rewritten with that parent's NEW
 * name, so `pages_blocks_hero` -> `eg_pages_blocks_hero`, `_posts_v_rels` ->
 * `_eg_posts_v_rels`, `ac_seo_settings_schema_same_as` ->
 * `eg_seo_settings_schema_same_as`.
 *
 * IMPORTANT: run this against a database that has NOT yet been renamed (the
 * pre-rename backup, or a fresh replay of the migrations up to the one before
 * the rename). Against an already-renamed database there is nothing left to
 * match and it will emit an empty mapping.
 *
 * The engine's own bookkeeping tables are deliberately excluded - renaming them
 * breaks migration tracking and admin state - as is Cloudflare's `_cf_METADATA`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import config from '@engage-config'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(projectRoot, 'src/migrations/schema/tableRenames.ts')

/**
 * Excluded from THIS generator's output. The engine's bookkeeping tables are
 * renamed too, but by hand in src/migrations/schema/engineTables.ts, because
 * their config side needs a matching `dbName` patch that this script cannot
 * infer. _cf_METADATA is Cloudflare's own and is never touched.
 */
const LEAVE_ALONE = new Set([
  'payload_migrations',
  'payload_preferences',
  'payload_preferences_rels',
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'payload_kv',
  '_cf_METADATA',
])

const snake = (slug: string) => slug.replace(/-/g, '_')

function currentTables(): string[] {
  const stdout = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'D1',
      '--local',
      '--json',
      '--command',
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1 << 28 },
  )
  // wrangler prints a proxy notice before the JSON payload.
  const parsed = JSON.parse(stdout.slice(stdout.indexOf('['))) as {
    results: { name: string }[]
  }[]
  return parsed[0].results.map((row) => row.name)
}

const resolved: any = await config
const entities: { slug: string; dbName?: string }[] = [
  ...(resolved.collections ?? []),
  ...(resolved.globals ?? []),
]

const tables = currentTables()
const tableSet = new Set(tables)

/** True when `base` is the parent of at least one table in the database. */
const isPresent = (base: string) =>
  tableSet.has(base) ||
  tableSet.has(`_${base}_v`) ||
  tables.some((t) => t.startsWith(`${base}_`) || t.startsWith(`_${base}_v`))

type Parent = { old: string; next: string }
const parents: Parent[] = []
const missing: string[] = []

for (const entity of entities) {
  if (!entity.dbName) continue // engine-owned collections have no dbName - skip
  const plain = snake(entity.slug)
  const prefixed = `ac_${plain}` // the retired prefix some globals shipped with
  const old = isPresent(plain) ? plain : isPresent(prefixed) ? prefixed : undefined
  if (!old) {
    missing.push(entity.slug)
    continue
  }
  parents.push({ old, next: entity.dbName })
}

// Longest first, so `page_templates` wins over any shorter prefix that also matches.
parents.sort((a, b) => b.old.length - a.old.length)

const renames: { from: string; to: string }[] = []
const legacy: string[] = []

for (const table of tables) {
  if (LEAVE_ALONE.has(table)) continue

  let to: string | undefined

  for (const parent of parents) {
    if (table.startsWith('_')) {
      // Version tables: _<parent>_v, _<parent>_v_rels, _<parent>_v_blocks_*
      const head = `_${parent.old}_v`
      if (table === head || table.startsWith(`${head}_`)) {
        to = `_${parent.next}_v${table.slice(head.length)}`
        break
      }
    } else if (table === parent.old || table.startsWith(`${parent.old}_`)) {
      to = parent.next + table.slice(parent.old.length)
      break
    }
  }

  if (!to) {
    // Left over from a collection or global that no longer exists in the
    // config. Still an application table, so it gets the prefix too.
    to = table.startsWith('_') ? `_eg_${table.slice(1)}` : `eg_${table}`
    legacy.push(table)
  }

  if (to !== table) renames.push({ from: table, to })
}

renames.sort((a, b) => a.from.localeCompare(b.from))

const header = `/**
 * Old -> new table names for the \`eg_\` (Engage) prefix rename.
 *
 * GENERATED, then committed - do not hand-edit. Regenerate with:
 *
 *   NODE_OPTIONS=--no-deprecation PAYLOAD_SECRET=ignore \\
 *     npx tsx scripts/generateTableRenames.mts
 *
 * That script reads the new parent table names from every collection's and
 * global's \`dbName\` in src/engage.config.ts, reads the real table list from the
 * local emulated D1 (which tracks the same migration state as production), and
 * rewrites each child and version table by its parent - so nothing here is
 * typed by hand. It must be run against a database that has not yet been
 * renamed. See the script's own header for the full procedure.
 *
 * Absent here, but NOT left alone: the engine's own bookkeeping tables
 * (migration history, preferences, document locks, KV) are renamed separately
 * by migrations/schema/engineTables.ts, together with the relationship columns
 * that had to move with them. Only Cloudflare's own _cf_METADATA is untouched.
 */

export const TABLE_RENAMES: { from: string; to: string }[] = [
`

const body = renames
  .map((entry) => `  { from: '${entry.from}', to: '${entry.to}' },`)
  .join('\n')

fs.writeFileSync(outFile, `${header}${body}\n]\n`)

console.log(`Wrote ${renames.length} renames to ${path.relative(projectRoot, outFile)}`)
if (legacy.length) {
  console.log(`Legacy tables with no matching config entity (prefixed anyway): ${legacy.join(', ')}`)
}
if (missing.length) {
  console.log(`Config entities with no table in this database (skipped): ${missing.join(', ')}`)
}
process.exit(0)
