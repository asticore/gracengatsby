import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Reusable sections (the `reusable-sections` collection, see src/collections/ReusableSections.ts)
// and the Reusable section block (`reusableSection`, see src/blocks/ReusableSection.ts).
//
// Creates, in this order:
//  1. eg_reusable_sections and its child tables - one per block type, plus the shared _rels table -
//     the same shape as eg_page_templates, copied from its real DDL.
//  2. eg_<parent>_blocks_reusable_section for every parent that can hold a page-builder block, so a
//     page, post, product, template or settings global can point at a section. The block's single
//     relationship is a `section_id` column, the same way the Loop block stores its template.
//
// Written by hand, like the other block migrations here, so it can run on a production D1 that
// already has some of these tables. Everything is replayable: CREATE TABLE IF NOT EXISTS and
// CREATE INDEX IF NOT EXISTS. A parent table that does not exist yet belongs to a feature whose own
// migration has not run, so it is skipped rather than failing the chain.
//
// Column names are what src/cms/db/schema/generate.ts produces for the fields. Change one, change both.
// section_id is nullable on purpose: deleting a section sets it to null, so the block renders nothing
// rather than the delete failing.

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections\` ( \`id\` integer PRIMARY KEY NOT NULL, \`name\` text NOT NULL, \`description\` text, \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL , \`locks\` text)`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_cta_banner\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text NOT NULL, \`text\` text, \`button_label\` text, \`button_url\` text, \`style\` text DEFAULT 'dark', \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_element\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`element_type\` text NOT NULL, \`props\` text, \`design\` text, \`block_name\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_reusable_sections\`(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_event_grid\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`show_past\` integer DEFAULT false, \`limit\` numeric DEFAULT 3, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_faq\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text DEFAULT 'Frequently asked questions', \`source\` text DEFAULT 'category', \`category\` text, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_form\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`show_title\` integer DEFAULT true, \`intro\` text, \`block_name\` text, \`design\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_gallery\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_hero\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text NOT NULL, \`subheading\` text, \`background_image_id\` integer, \`primary_cta_label\` text, \`primary_cta_url\` text, \`secondary_cta_label\` text, \`secondary_cta_url\` text, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`background_image_id\`) REFERENCES "eg_media"(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_image_text\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`image_id\` integer NOT NULL, \`content\` text NOT NULL, \`image_side\` text DEFAULT 'left', \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`image_id\`) REFERENCES "eg_media"(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_loop\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`template_id\` integer NOT NULL, \`source\` text DEFAULT 'products', \`category\` text, \`limit\` numeric DEFAULT 6, \`columns\` numeric DEFAULT 3, \`sort_by\` text DEFAULT 'newest', \`design\` text, \`block_name\` text, FOREIGN KEY (\`template_id\`) REFERENCES \`eg_page_templates\`(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_product_grid\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`category\` text, \`limit\` numeric DEFAULT 4, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_rich_text\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`content\` text NOT NULL, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_section\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`columns\` text, \`design\` text, \`block_name\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_blocks_toc\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`title\` text DEFAULT 'On this page', \`levels\` text DEFAULT 'h2-h4', \`collapsible\` integer DEFAULT true, \`block_name\` text, \`design\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_reusable_sections_rels\` ( \`id\` integer PRIMARY KEY NOT NULL, \`order\` integer, \`parent_id\` integer NOT NULL, \`path\` text NOT NULL, "eg_media_id" integer, "eg_faqs_id" integer, \`eg_forms_id\` integer REFERENCES "eg_forms"(id), FOREIGN KEY (\`parent_id\`) REFERENCES "eg_reusable_sections"(\`id\`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY ("eg_media_id") REFERENCES "eg_media"(\`id\`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY ("eg_faqs_id") REFERENCES "eg_faqs"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
];

const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_element_order_idx\` ON \`eg_reusable_sections_blocks_element\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_element_parent_id_idx\` ON \`eg_reusable_sections_blocks_element\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_element_path_idx\` ON \`eg_reusable_sections_blocks_element\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_form_order_idx\` ON \`eg_reusable_sections_blocks_form\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_form_parent_id_idx\` ON \`eg_reusable_sections_blocks_form\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_form_path_idx\` ON \`eg_reusable_sections_blocks_form\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_toc_order_idx\` ON \`eg_reusable_sections_blocks_toc\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_toc_parent_id_idx\` ON \`eg_reusable_sections_blocks_toc\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_toc_path_idx\` ON \`eg_reusable_sections_blocks_toc\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_cta_banner_order_idx\` ON "eg_reusable_sections_blocks_cta_banner" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_cta_banner_parent_id_idx\` ON "eg_reusable_sections_blocks_cta_banner" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_cta_banner_path_idx\` ON "eg_reusable_sections_blocks_cta_banner" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_event_grid_order_idx\` ON "eg_reusable_sections_blocks_event_grid" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_event_grid_parent_id_idx\` ON "eg_reusable_sections_blocks_event_grid" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_event_grid_path_idx\` ON "eg_reusable_sections_blocks_event_grid" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_faq_order_idx\` ON "eg_reusable_sections_blocks_faq" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_faq_parent_id_idx\` ON "eg_reusable_sections_blocks_faq" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_faq_path_idx\` ON "eg_reusable_sections_blocks_faq" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_gallery_order_idx\` ON "eg_reusable_sections_blocks_gallery" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_gallery_parent_id_idx\` ON "eg_reusable_sections_blocks_gallery" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_gallery_path_idx\` ON "eg_reusable_sections_blocks_gallery" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_hero_background_image_idx\` ON "eg_reusable_sections_blocks_hero" (\`background_image_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_hero_order_idx\` ON "eg_reusable_sections_blocks_hero" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_hero_parent_id_idx\` ON "eg_reusable_sections_blocks_hero" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_hero_path_idx\` ON "eg_reusable_sections_blocks_hero" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_image_text_image_idx\` ON "eg_reusable_sections_blocks_image_text" (\`image_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_image_text_order_idx\` ON "eg_reusable_sections_blocks_image_text" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_image_text_parent_id_idx\` ON "eg_reusable_sections_blocks_image_text" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_image_text_path_idx\` ON "eg_reusable_sections_blocks_image_text" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_loop_order_idx\` ON "eg_reusable_sections_blocks_loop" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_loop_parent_id_idx\` ON "eg_reusable_sections_blocks_loop" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_loop_path_idx\` ON "eg_reusable_sections_blocks_loop" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_loop_template_idx\` ON "eg_reusable_sections_blocks_loop" (\`template_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_product_grid_order_idx\` ON "eg_reusable_sections_blocks_product_grid" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_product_grid_parent_id_idx\` ON "eg_reusable_sections_blocks_product_grid" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_product_grid_path_idx\` ON "eg_reusable_sections_blocks_product_grid" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_rich_text_order_idx\` ON "eg_reusable_sections_blocks_rich_text" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_rich_text_parent_id_idx\` ON "eg_reusable_sections_blocks_rich_text" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_rich_text_path_idx\` ON "eg_reusable_sections_blocks_rich_text" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_section_order_idx\` ON "eg_reusable_sections_blocks_section" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_section_parent_id_idx\` ON "eg_reusable_sections_blocks_section" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_blocks_section_path_idx\` ON "eg_reusable_sections_blocks_section" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_created_at_idx\` ON "eg_reusable_sections" (\`created_at\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_rels_faqs_id_idx\` ON "eg_reusable_sections_rels" ("eg_faqs_id")`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_rels_media_id_idx\` ON "eg_reusable_sections_rels" ("eg_media_id")`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_rels_order_idx\` ON "eg_reusable_sections_rels" (\`order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_rels_parent_idx\` ON "eg_reusable_sections_rels" (\`parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_rels_path_idx\` ON "eg_reusable_sections_rels" (\`path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_reusable_sections_updated_at_idx\` ON "eg_reusable_sections" (\`updated_at\`)`,
];

// Every parent that can hold the reusable section block. Versioned parents (drafts) use an integer id
// plus `_uuid`, the same as the other block tables. The collection's own table is listed too, since a
// section can contain another section.
const BLOCK_PARENTS: { table: string; parent: string; versioned: boolean }[] = [
  { table: 'eg_pages_blocks_reusable_section', parent: 'eg_pages', versioned: false },
  { table: '_eg_pages_v_blocks_reusable_section', parent: '_eg_pages_v', versioned: true },
  { table: 'eg_posts_blocks_reusable_section', parent: 'eg_posts', versioned: false },
  { table: '_eg_posts_v_blocks_reusable_section', parent: '_eg_posts_v', versioned: true },
  { table: 'eg_products_blocks_reusable_section', parent: 'eg_products', versioned: false },
  { table: '_eg_products_v_blocks_reusable_section', parent: '_eg_products_v', versioned: true },
  { table: 'eg_page_templates_blocks_reusable_section', parent: 'eg_page_templates', versioned: false },
  { table: 'eg_lessons_blocks_reusable_section', parent: 'eg_lessons', versioned: false },
  { table: 'eg_blog_settings_blocks_reusable_section', parent: 'eg_blog_settings', versioned: false },
  { table: 'eg_faq_settings_blocks_reusable_section', parent: 'eg_faq_settings', versioned: false },
  { table: 'eg_shop_settings_blocks_reusable_section', parent: 'eg_shop_settings', versioned: false },
  { table: 'eg_reusable_sections_blocks_reusable_section', parent: 'eg_reusable_sections', versioned: false },
]

const blockTable = ({ table, parent, versioned }: (typeof BLOCK_PARENTS)[number]): string =>
  `CREATE TABLE IF NOT EXISTS \`${table}\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`_path\` text NOT NULL,
  \`id\` ${versioned ? 'integer' : 'text'} PRIMARY KEY NOT NULL,
  \`section_id\` integer,
  \`design\` text,
  ${versioned ? '`_uuid` text,\n  ' : ''}\`block_name\` text,
  FOREIGN KEY (\`section_id\`) REFERENCES \`eg_reusable_sections\`(\`id\`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (\`_parent_id\`) REFERENCES "${parent}"(\`id\`) ON UPDATE no action ON DELETE cascade
)`

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const statement of INDEXES) await db.run(sql.raw(statement))

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
    for (const column of ['_order', '_parent_id', '_path', 'section_id']) {
      await db.run(
        sql.raw(`CREATE INDEX IF NOT EXISTS \`${entry.table}_${column}_idx\` ON \`${entry.table}\` (\`${column}\`)`),
      )
    }
  }

  engine.logger.info('[migrate] Reusable sections tables and the reusable section block tables are present.')
  if (skipped.length > 0) {
    engine.logger.warn(`[migrate] Reusable section block tables skipped - no parent table yet: ${skipped.join(', ')}`)
  }
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping the tables would delete every reusable section.
  engine.logger.info('[migrate] Down is a no-op - reusable section tables are left in place.')
}
