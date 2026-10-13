import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates the per-parent block tables for the Table of contents block (`toc`, see
// src/blocks/TableOfContents.ts): one row per block, holding its title, which headings
// it lists, whether readers can collapse it, and its Design JSON.
//
// Written by hand, like the other block migrations here, so it can run on a production D1
// that already has some of these tables. Everything is replayable: CREATE TABLE IF NOT
// EXISTS and CREATE INDEX IF NOT EXISTS. A parent table that does not exist yet belongs to
// a feature whose own migration has not run, so it is skipped rather than failing the chain.
//
// Column names are what src/cms/db/schema/generate.ts produces for the block's fields.
// Change one, change both.

const BLOCK_PARENTS: { table: string; parent: string; versioned: boolean }[] = [
  { table: 'eg_pages_blocks_toc', parent: 'eg_pages', versioned: false },
  { table: '_eg_pages_v_blocks_toc', parent: '_eg_pages_v', versioned: true },
  { table: 'eg_posts_blocks_toc', parent: 'eg_posts', versioned: false },
  { table: '_eg_posts_v_blocks_toc', parent: '_eg_posts_v', versioned: true },
  { table: 'eg_products_blocks_toc', parent: 'eg_products', versioned: false },
  { table: '_eg_products_v_blocks_toc', parent: '_eg_products_v', versioned: true },
  { table: 'eg_page_templates_blocks_toc', parent: 'eg_page_templates', versioned: false },
  { table: 'eg_lessons_blocks_toc', parent: 'eg_lessons', versioned: false },
  { table: 'eg_blog_settings_blocks_toc', parent: 'eg_blog_settings', versioned: false },
  { table: 'eg_faq_settings_blocks_toc', parent: 'eg_faq_settings', versioned: false },
  { table: 'eg_shop_settings_blocks_toc', parent: 'eg_shop_settings', versioned: false },
]

// Versioned parents (drafts) use an integer id plus `_uuid`, the same as the other block tables.
const blockTable = ({ table, parent, versioned }: (typeof BLOCK_PARENTS)[number]): string =>
  `CREATE TABLE IF NOT EXISTS \`${table}\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`_path\` text NOT NULL,
  \`id\` ${versioned ? 'integer' : 'text'} PRIMARY KEY NOT NULL,
  \`title\` text DEFAULT 'On this page',
  \`levels\` text DEFAULT 'h2-h4',
  \`collapsible\` integer DEFAULT true,
  ${versioned ? '`_uuid` text,\n  ' : ''}\`block_name\` text,
  \`design\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES "${parent}"(\`id\`) ON UPDATE no action ON DELETE cascade
)`

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const exists = async (table: string): Promise<boolean> => {
    const rows = (await db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
    )) as { name: string }[]
    return rows.length > 0
  }

  const skipped: string[] = []
  for (const entry of BLOCK_PARENTS) {
    if (!(await exists(entry.parent))) {
      skipped.push(entry.parent)
      continue
    }
    await db.run(sql.raw(blockTable(entry)))
    await db.run(
      sql.raw(`CREATE INDEX IF NOT EXISTS \`${entry.table}_order_idx\` ON \`${entry.table}\` (\`_order\`)`),
    )
    await db.run(
      sql.raw(`CREATE INDEX IF NOT EXISTS \`${entry.table}_parent_id_idx\` ON \`${entry.table}\` (\`_parent_id\`)`),
    )
    await db.run(
      sql.raw(`CREATE INDEX IF NOT EXISTS \`${entry.table}_path_idx\` ON \`${entry.table}\` (\`_path\`)`),
    )
  }

  engine.logger.info('[migrate] Table of contents block tables are present.')
  if (skipped.length > 0) {
    engine.logger.warn(`[migrate] Table of contents block tables skipped - no parent table yet: ${skipped.join(', ')}`)
  }
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping the tables would delete the
  // table of contents settings on every page that uses the block.
  engine.logger.info('[migrate] Down is a no-op - table of contents block tables are left in place.')
}
