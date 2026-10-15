import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Site templates (the `site-templates` collection, see src/collections/SiteTemplates.ts): a header,
// footer or whole-page layout (single post / product / event, blog / shop archive, 404, search)
// built from the same page-builder blocks as pages.
//
// Creates eg_site_templates, one child table per block type (all 14, including toc and
// reusable_section, which earlier migrations only added to the parents that existed then) and the
// shared _rels table - the same shape as eg_page_templates / eg_reusable_sections.
//
// Everything is replayable: CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS. Column names
// are what src/cms/db/schema/generate.ts produces for the fields. Change one, change both.

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates\` ( \`id\` integer PRIMARY KEY NOT NULL, \`name\` text NOT NULL, \`kind\` text DEFAULT 'single-post' NOT NULL, \`enabled\` integer DEFAULT true, \`priority\` numeric DEFAULT 10, \`conditions\` text DEFAULT '[]', \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL , \`locks\` text)`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_cta_banner\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text NOT NULL, \`text\` text, \`button_label\` text, \`button_url\` text, \`style\` text DEFAULT 'dark', \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_element\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`element_type\` text NOT NULL, \`props\` text, \`design\` text, \`block_name\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_site_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_event_grid\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`show_past\` integer DEFAULT false, \`limit\` numeric DEFAULT 3, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_faq\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text DEFAULT 'Frequently asked questions', \`source\` text DEFAULT 'category', \`category\` text, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_form\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`show_title\` integer DEFAULT true, \`intro\` text, \`block_name\` text, \`design\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_gallery\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_hero\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text NOT NULL, \`subheading\` text, \`background_image_id\` integer, \`primary_cta_label\` text, \`primary_cta_url\` text, \`secondary_cta_label\` text, \`secondary_cta_url\` text, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`background_image_id\`) REFERENCES "eg_media"(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_image_text\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`image_id\` integer NOT NULL, \`content\` text NOT NULL, \`image_side\` text DEFAULT 'left', \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`image_id\`) REFERENCES "eg_media"(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_loop\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`template_id\` integer NOT NULL, \`source\` text DEFAULT 'products', \`category\` text, \`limit\` numeric DEFAULT 6, \`columns\` numeric DEFAULT 3, \`sort_by\` text DEFAULT 'newest', \`design\` text, \`block_name\` text, FOREIGN KEY (\`template_id\`) REFERENCES \`eg_page_templates\`(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_product_grid\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`heading\` text, \`category\` text, \`limit\` numeric DEFAULT 4, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_rich_text\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`content\` text NOT NULL, \`block_name\` text, \`design\` TEXT, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_section\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`columns\` text, \`design\` text, \`block_name\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_toc\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`title\` text DEFAULT 'On this page', \`levels\` text DEFAULT 'h2-h4', \`collapsible\` integer DEFAULT true, \`block_name\` text, \`design\` text, FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_blocks_reusable_section\` ( \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`_path\` text NOT NULL, \`id\` text PRIMARY KEY NOT NULL, \`section_id\` integer, \`design\` text, \`block_name\` text, FOREIGN KEY (\`section_id\`) REFERENCES \`eg_reusable_sections\`(\`id\`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_site_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade )`,
  `CREATE TABLE IF NOT EXISTS \`eg_site_templates_rels\` ( \`id\` integer PRIMARY KEY NOT NULL, \`order\` integer, \`parent_id\` integer NOT NULL, \`path\` text NOT NULL, "eg_media_id" integer, "eg_faqs_id" integer, \`eg_forms_id\` integer REFERENCES "eg_forms"(id), FOREIGN KEY (\`parent_id\`) REFERENCES "eg_site_templates"(\`id\`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY ("eg_media_id") REFERENCES "eg_media"(\`id\`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY ("eg_faqs_id") REFERENCES "eg_faqs"(\`id\`) ON UPDATE no action ON DELETE cascade )`,
];

const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_element_order_idx\` ON \`eg_site_templates_blocks_element\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_element_parent_id_idx\` ON \`eg_site_templates_blocks_element\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_element_path_idx\` ON \`eg_site_templates_blocks_element\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_form_order_idx\` ON \`eg_site_templates_blocks_form\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_form_parent_id_idx\` ON \`eg_site_templates_blocks_form\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_form_path_idx\` ON \`eg_site_templates_blocks_form\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_toc_order_idx\` ON \`eg_site_templates_blocks_toc\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_toc_parent_id_idx\` ON \`eg_site_templates_blocks_toc\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_toc_path_idx\` ON \`eg_site_templates_blocks_toc\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_cta_banner_order_idx\` ON "eg_site_templates_blocks_cta_banner" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_cta_banner_parent_id_idx\` ON "eg_site_templates_blocks_cta_banner" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_cta_banner_path_idx\` ON "eg_site_templates_blocks_cta_banner" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_event_grid_order_idx\` ON "eg_site_templates_blocks_event_grid" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_event_grid_parent_id_idx\` ON "eg_site_templates_blocks_event_grid" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_event_grid_path_idx\` ON "eg_site_templates_blocks_event_grid" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_faq_order_idx\` ON "eg_site_templates_blocks_faq" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_faq_parent_id_idx\` ON "eg_site_templates_blocks_faq" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_faq_path_idx\` ON "eg_site_templates_blocks_faq" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_gallery_order_idx\` ON "eg_site_templates_blocks_gallery" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_gallery_parent_id_idx\` ON "eg_site_templates_blocks_gallery" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_gallery_path_idx\` ON "eg_site_templates_blocks_gallery" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_hero_background_image_idx\` ON "eg_site_templates_blocks_hero" (\`background_image_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_hero_order_idx\` ON "eg_site_templates_blocks_hero" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_hero_parent_id_idx\` ON "eg_site_templates_blocks_hero" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_hero_path_idx\` ON "eg_site_templates_blocks_hero" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_image_text_image_idx\` ON "eg_site_templates_blocks_image_text" (\`image_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_image_text_order_idx\` ON "eg_site_templates_blocks_image_text" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_image_text_parent_id_idx\` ON "eg_site_templates_blocks_image_text" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_image_text_path_idx\` ON "eg_site_templates_blocks_image_text" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_loop_order_idx\` ON "eg_site_templates_blocks_loop" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_loop_parent_id_idx\` ON "eg_site_templates_blocks_loop" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_loop_path_idx\` ON "eg_site_templates_blocks_loop" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_loop_template_idx\` ON "eg_site_templates_blocks_loop" (\`template_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_product_grid_order_idx\` ON "eg_site_templates_blocks_product_grid" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_product_grid_parent_id_idx\` ON "eg_site_templates_blocks_product_grid" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_product_grid_path_idx\` ON "eg_site_templates_blocks_product_grid" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_rich_text_order_idx\` ON "eg_site_templates_blocks_rich_text" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_rich_text_parent_id_idx\` ON "eg_site_templates_blocks_rich_text" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_rich_text_path_idx\` ON "eg_site_templates_blocks_rich_text" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_section_order_idx\` ON "eg_site_templates_blocks_section" (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_section_parent_id_idx\` ON "eg_site_templates_blocks_section" (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_section_path_idx\` ON "eg_site_templates_blocks_section" (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_reusable_section_order_idx\` ON \`eg_site_templates_blocks_reusable_section\` (\`_order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_reusable_section_parent_id_idx\` ON \`eg_site_templates_blocks_reusable_section\` (\`_parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_reusable_section_path_idx\` ON \`eg_site_templates_blocks_reusable_section\` (\`_path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_blocks_reusable_section_section_idx\` ON \`eg_site_templates_blocks_reusable_section\` (\`section_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_created_at_idx\` ON "eg_site_templates" (\`created_at\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_rels_faqs_id_idx\` ON "eg_site_templates_rels" ("eg_faqs_id")`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_rels_media_id_idx\` ON "eg_site_templates_rels" ("eg_media_id")`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_rels_order_idx\` ON "eg_site_templates_rels" (\`order\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_rels_parent_idx\` ON "eg_site_templates_rels" (\`parent_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_rels_path_idx\` ON "eg_site_templates_rels" (\`path\`)`,
  `CREATE INDEX IF NOT EXISTS \`eg_site_templates_updated_at_idx\` ON "eg_site_templates" (\`updated_at\`)`,
];


export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const statement of INDEXES) await db.run(sql.raw(statement))
  engine.logger.info('[migrate] Site templates tables are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping the tables would delete every site template.
  engine.logger.info('[migrate] Down is a no-op - site template tables are left in place.')
}
