import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Hand-authored (not the raw `migrate:create` CLI output) so this only
// contains the true incremental delta against production. The local dev D1
// used to generate the raw diff didn't have migrations 2-4 applied, so the
// auto-generated file tried to recreate tables (pages, products, site_settings,
// events, ...) that already exist in prod - applying it as-is would have
// failed with "table already exists". Every statement below was cross-checked
// against migrations 20260819_043357 / 20260819_070238 / 20260819_100000 to
// confirm it's additive only. See MIGRATIONS.md for the full note.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ---- Pages: homepage flag, hierarchy (parent), starter template, SEO ----
  await db.run(sql`ALTER TABLE \`pages\` ADD \`is_homepage\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`parent_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`template_id\` integer REFERENCES page_templates(id);`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`seo_meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`seo_meta_description\` text;`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`seo_og_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`seo_no_index\` integer DEFAULT false;`)
  await db.run(sql`CREATE INDEX \`pages_parent_idx\` ON \`pages\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_template_idx\` ON \`pages\` (\`template_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_seo_seo_og_image_idx\` ON \`pages\` (\`seo_og_image_id\`);`)
  // Slug uniqueness is now per-parent (enforced in the Pages collection's
  // validate function), not global - swap the unique index for a plain one.
  await db.run(sql`DROP INDEX \`pages_slug_idx\`;`)
  await db.run(sql`CREATE INDEX \`pages_slug_idx\` ON \`pages\` (\`slug\`);`)

  await db.run(sql`ALTER TABLE \`pages_rels\` ADD \`faqs_id\` integer REFERENCES faqs(id);`)
  await db.run(sql`CREATE INDEX \`pages_rels_faqs_id_idx\` ON \`pages_rels\` (\`faqs_id\`);`)

  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_is_homepage\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_parent_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_template_id\` integer REFERENCES page_templates(id);`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_seo_meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_seo_meta_description\` text;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_seo_og_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_seo_no_index\` integer DEFAULT false;`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_parent_idx\` ON \`_pages_v\` (\`version_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_template_idx\` ON \`_pages_v\` (\`version_template_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_seo_version_seo_og_image_idx\` ON \`_pages_v\` (\`version_seo_og_image_id\`);`)

  await db.run(sql`ALTER TABLE \`_pages_v_rels\` ADD \`faqs_id\` integer REFERENCES faqs(id);`)
  await db.run(sql`CREATE INDEX \`_pages_v_rels_faqs_id_idx\` ON \`_pages_v_rels\` (\`faqs_id\`);`)

  // New FAQ block table (the other pages_blocks_* tables already exist).
  await db.run(sql`CREATE TABLE \`pages_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_blocks_faq_order_idx\` ON \`pages_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_faq_parent_id_idx\` ON \`pages_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_faq_path_idx\` ON \`pages_blocks_faq\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`_pages_v_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_pages_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_pages_v_blocks_faq_order_idx\` ON \`_pages_v_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_blocks_faq_parent_id_idx\` ON \`_pages_v_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_blocks_faq_path_idx\` ON \`_pages_v_blocks_faq\` (\`_path\`);`)

  // ---- Page Templates (new collection) ----
  await db.run(sql`CREATE TABLE \`page_templates_blocks_hero\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text NOT NULL,
  	\`subheading\` text,
  	\`background_image_id\` integer,
  	\`primary_cta_label\` text,
  	\`primary_cta_url\` text,
  	\`secondary_cta_label\` text,
  	\`secondary_cta_url\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`background_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_hero_order_idx\` ON \`page_templates_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_hero_parent_id_idx\` ON \`page_templates_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_hero_path_idx\` ON \`page_templates_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_hero_background_image_idx\` ON \`page_templates_blocks_hero\` (\`background_image_id\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`content\` text NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_rich_text_order_idx\` ON \`page_templates_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_rich_text_parent_id_idx\` ON \`page_templates_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_rich_text_path_idx\` ON \`page_templates_blocks_rich_text\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer NOT NULL,
  	\`content\` text NOT NULL,
  	\`image_side\` text DEFAULT 'left',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_image_text_order_idx\` ON \`page_templates_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_image_text_parent_id_idx\` ON \`page_templates_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_image_text_path_idx\` ON \`page_templates_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_image_text_image_idx\` ON \`page_templates_blocks_image_text\` (\`image_id\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_product_grid_order_idx\` ON \`page_templates_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_product_grid_parent_id_idx\` ON \`page_templates_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_product_grid_path_idx\` ON \`page_templates_blocks_product_grid\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_event_grid_order_idx\` ON \`page_templates_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_event_grid_parent_id_idx\` ON \`page_templates_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_event_grid_path_idx\` ON \`page_templates_blocks_event_grid\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_gallery_order_idx\` ON \`page_templates_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_gallery_parent_id_idx\` ON \`page_templates_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_gallery_path_idx\` ON \`page_templates_blocks_gallery\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_faq_order_idx\` ON \`page_templates_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_faq_parent_id_idx\` ON \`page_templates_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_faq_path_idx\` ON \`page_templates_blocks_faq\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_blocks_cta_banner\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text NOT NULL,
  	\`text\` text,
  	\`button_label\` text,
  	\`button_url\` text,
  	\`style\` text DEFAULT 'dark',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_cta_banner_order_idx\` ON \`page_templates_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_cta_banner_parent_id_idx\` ON \`page_templates_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_blocks_cta_banner_path_idx\` ON \`page_templates_blocks_cta_banner\` (\`_path\`);`)

  await db.run(sql`CREATE TABLE \`page_templates\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_updated_at_idx\` ON \`page_templates\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_created_at_idx\` ON \`page_templates\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`page_templates_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`faqs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`page_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faqs_id\`) REFERENCES \`faqs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`page_templates_rels_order_idx\` ON \`page_templates_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_rels_parent_idx\` ON \`page_templates_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_rels_path_idx\` ON \`page_templates_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_rels_media_id_idx\` ON \`page_templates_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`page_templates_rels_faqs_id_idx\` ON \`page_templates_rels\` (\`faqs_id\`);`)

  // ---- FAQs (new collection) ----
  await db.run(sql`CREATE TABLE \`faqs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`question\` text NOT NULL,
  	\`answer\` text NOT NULL,
  	\`category\` text,
  	\`order\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`faqs_updated_at_idx\` ON \`faqs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`faqs_created_at_idx\` ON \`faqs\` (\`created_at\`);`)

  // ---- Products: SEO fields + FAQs relationship ----
  await db.run(sql`ALTER TABLE \`products\` ADD \`seo_meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`products\` ADD \`seo_meta_description\` text;`)
  await db.run(sql`ALTER TABLE \`products\` ADD \`seo_og_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`products\` ADD \`seo_no_index\` integer DEFAULT false;`)
  await db.run(sql`CREATE INDEX \`products_seo_seo_og_image_idx\` ON \`products\` (\`seo_og_image_id\`);`)

  await db.run(sql`ALTER TABLE \`products_rels\` ADD \`faqs_id\` integer REFERENCES faqs(id);`)
  await db.run(sql`CREATE INDEX \`products_rels_faqs_id_idx\` ON \`products_rels\` (\`faqs_id\`);`)

  await db.run(sql`ALTER TABLE \`_products_v\` ADD \`version_seo_meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`_products_v\` ADD \`version_seo_meta_description\` text;`)
  await db.run(sql`ALTER TABLE \`_products_v\` ADD \`version_seo_og_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`_products_v\` ADD \`version_seo_no_index\` integer DEFAULT false;`)
  await db.run(sql`CREATE INDEX \`_products_v_version_seo_version_seo_og_image_idx\` ON \`_products_v\` (\`version_seo_og_image_id\`);`)

  await db.run(sql`ALTER TABLE \`_products_v_rels\` ADD \`faqs_id\` integer REFERENCES faqs(id);`)
  await db.run(sql`CREATE INDEX \`_products_v_rels_faqs_id_idx\` ON \`_products_v_rels\` (\`faqs_id\`);`)

  // ---- Posts (new collection - blog) ----
  await db.run(sql`CREATE TABLE \`posts_categories\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_categories_order_idx\` ON \`posts_categories\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_categories_parent_id_idx\` ON \`posts_categories\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`posts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`slug\` text,
  	\`published_date\` text,
  	\`author_id\` integer,
  	\`featured_image_id\` integer,
  	\`excerpt\` text,
  	\`content\` text,
  	\`seo_meta_title\` text,
  	\`seo_meta_description\` text,
  	\`seo_og_image_id\` integer,
  	\`seo_no_index\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`featured_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`seo_og_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`posts_slug_idx\` ON \`posts\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`posts_author_idx\` ON \`posts\` (\`author_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_featured_image_idx\` ON \`posts\` (\`featured_image_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_seo_seo_og_image_idx\` ON \`posts\` (\`seo_og_image_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_updated_at_idx\` ON \`posts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`posts_created_at_idx\` ON \`posts\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`posts__status_idx\` ON \`posts\` (\`_status\`);`)

  await db.run(sql`CREATE TABLE \`_posts_v_version_categories\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_version_categories_order_idx\` ON \`_posts_v_version_categories\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_categories_parent_id_idx\` ON \`_posts_v_version_categories\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`_posts_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_slug\` text,
  	\`version_published_date\` text,
  	\`version_author_id\` integer,
  	\`version_featured_image_id\` integer,
  	\`version_excerpt\` text,
  	\`version_content\` text,
  	\`version_seo_meta_title\` text,
  	\`version_seo_meta_description\` text,
  	\`version_seo_og_image_id\` integer,
  	\`version_seo_no_index\` integer DEFAULT false,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_featured_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_seo_og_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_parent_idx\` ON \`_posts_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_slug_idx\` ON \`_posts_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_author_idx\` ON \`_posts_v\` (\`version_author_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_featured_image_idx\` ON \`_posts_v\` (\`version_featured_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_seo_version_seo_og_image_idx\` ON \`_posts_v\` (\`version_seo_og_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_updated_at_idx\` ON \`_posts_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version_created_at_idx\` ON \`_posts_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_version_version__status_idx\` ON \`_posts_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_created_at_idx\` ON \`_posts_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_updated_at_idx\` ON \`_posts_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_latest_idx\` ON \`_posts_v\` (\`latest\`);`)

  // ---- Header / Footer (new globals, replacing Navigation) ----
  await db.run(sql`CREATE TABLE \`header_menu_children\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`link_type\` text DEFAULT 'custom',
  	\`page_id\` integer,
  	\`custom_url\` text,
  	\`open_in_new_tab\` integer DEFAULT false,
  	FOREIGN KEY (\`page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`header_menu\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`header_menu_children_order_idx\` ON \`header_menu_children\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`header_menu_children_parent_id_idx\` ON \`header_menu_children\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`header_menu_children_page_idx\` ON \`header_menu_children\` (\`page_id\`);`)

  await db.run(sql`CREATE TABLE \`header_menu\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`link_type\` text DEFAULT 'custom',
  	\`page_id\` integer,
  	\`custom_url\` text,
  	\`open_in_new_tab\` integer DEFAULT false,
  	FOREIGN KEY (\`page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`header\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`header_menu_order_idx\` ON \`header_menu\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`header_menu_parent_id_idx\` ON \`header_menu\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`header_menu_page_idx\` ON \`header_menu\` (\`page_id\`);`)

  await db.run(sql`CREATE TABLE \`header_socials_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`platform\` text,
  	\`url\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`header\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`header_socials_links_order_idx\` ON \`header_socials_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`header_socials_links_parent_id_idx\` ON \`header_socials_links\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`header\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`show_logo\` integer DEFAULT true,
  	\`sticky\` integer DEFAULT true,
  	\`show_cart\` integer DEFAULT true,
  	\`desktop_layout\` text DEFAULT 'logo-left',
  	\`mobile_layout\` text DEFAULT 'slide-in',
  	\`announcement_bar_enabled\` integer DEFAULT false,
  	\`announcement_bar_text\` text,
  	\`announcement_bar_link_url\` text,
  	\`announcement_bar_dismissible\` integer DEFAULT true,
  	\`socials_show\` integer DEFAULT false,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  await db.run(sql`CREATE TABLE \`footer_columns_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`link_type\` text DEFAULT 'custom',
  	\`page_id\` integer,
  	\`custom_url\` text,
  	FOREIGN KEY (\`page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`footer_columns\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`footer_columns_links_order_idx\` ON \`footer_columns_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`footer_columns_links_parent_id_idx\` ON \`footer_columns_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`footer_columns_links_page_idx\` ON \`footer_columns_links\` (\`page_id\`);`)

  await db.run(sql`CREATE TABLE \`footer_columns\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`footer\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`footer_columns_order_idx\` ON \`footer_columns\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`footer_columns_parent_id_idx\` ON \`footer_columns\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`footer_socials_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`platform\` text,
  	\`url\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`footer\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`footer_socials_links_order_idx\` ON \`footer_socials_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`footer_socials_links_parent_id_idx\` ON \`footer_socials_links\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`footer\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`show_logo\` integer DEFAULT true,
  	\`layout\` text DEFAULT 'columns-3',
  	\`bottom_text\` text DEFAULT 'A curated boutique for the modern romantic - considered pieces, small-batch goods, and evenings worth dressing up for.',
  	\`contact_email\` text,
  	\`contact_phone\` text,
  	\`contact_address\` text DEFAULT 'Brisbane, Australia',
  	\`socials_show\` integer DEFAULT true,
  	\`copyright_text\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  // ---- Site Settings: theme extensions, SEO defaults, feature toggles ----
  // (Old columns - announcement_bar, footer_* - are left in place, just no
  // longer read by the app. Dropping them isn't necessary and avoids risk.)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`theme_button_style\` text DEFAULT 'solid';`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`theme_corner_style\` text DEFAULT 'soft';`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`theme_hover_effect\` text DEFAULT 'fade';`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`seo_title_template\` text DEFAULT '%s | Grace & Gatsby';`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`seo_default_description\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`seo_default_og_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`seo_twitter_handle\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`seo_site_indexable\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`features_ecommerce\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`features_events\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`features_blog\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`features_faq\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`features_accounts\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`features_lms\` integer DEFAULT false;`)
  await db.run(sql`CREATE INDEX \`site_settings_seo_seo_default_og_image_idx\` ON \`site_settings\` (\`seo_default_og_image_id\`);`)

  // ---- Blog / FAQ / Shop settings (new globals) ----
  await db.run(sql`CREATE TABLE \`blog_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`archive_title\` text DEFAULT 'Journal',
  	\`archive_intro\` text,
  	\`archive_layout\` text DEFAULT 'grid',
  	\`posts_per_page\` numeric DEFAULT 9,
  	\`show_author\` integer DEFAULT true,
  	\`show_date\` integer DEFAULT true,
  	\`show_categories\` integer DEFAULT true,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  await db.run(sql`CREATE TABLE \`faq_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`page_title\` text DEFAULT 'Frequently Asked Questions',
  	\`intro\` text,
  	\`layout\` text DEFAULT 'accordion',
  	\`group_by_category\` integer DEFAULT true,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  await db.run(sql`CREATE TABLE \`shop_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`archive_layout\` text DEFAULT 'grid-4',
  	\`show_category_filters\` integer DEFAULT true,
  	\`show_related_products\` integer DEFAULT true,
  	\`show_short_description_on_card\` integer DEFAULT false,
  	\`product_image_aspect\` text DEFAULT 'portrait',
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  // ---- payload_locked_documents_rels: new collections need a ref column ----
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`page_templates_id\` integer REFERENCES page_templates(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`posts_id\` integer REFERENCES posts(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`faqs_id\` integer REFERENCES faqs(id);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`page_templates_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`posts_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`faqs_id\`;`)

  await db.run(sql`DROP TABLE \`shop_settings\`;`)
  await db.run(sql`DROP TABLE \`faq_settings\`;`)
  await db.run(sql`DROP TABLE \`blog_settings\`;`)

  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`features_lms\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`features_accounts\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`features_faq\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`features_blog\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`features_events\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`features_ecommerce\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`seo_site_indexable\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`seo_twitter_handle\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`seo_default_og_image_id\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`seo_default_description\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`seo_title_template\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`theme_hover_effect\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`theme_corner_style\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`theme_button_style\`;`)

  await db.run(sql`DROP TABLE \`footer\`;`)
  await db.run(sql`DROP TABLE \`footer_socials_links\`;`)
  await db.run(sql`DROP TABLE \`footer_columns\`;`)
  await db.run(sql`DROP TABLE \`footer_columns_links\`;`)
  await db.run(sql`DROP TABLE \`header\`;`)
  await db.run(sql`DROP TABLE \`header_socials_links\`;`)
  await db.run(sql`DROP TABLE \`header_menu\`;`)
  await db.run(sql`DROP TABLE \`header_menu_children\`;`)

  await db.run(sql`DROP TABLE \`_posts_v\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_version_categories\`;`)
  await db.run(sql`DROP TABLE \`posts\`;`)
  await db.run(sql`DROP TABLE \`posts_categories\`;`)

  await db.run(sql`ALTER TABLE \`_products_v_rels\` DROP COLUMN \`faqs_id\`;`)
  await db.run(sql`ALTER TABLE \`_products_v\` DROP COLUMN \`version_seo_no_index\`;`)
  await db.run(sql`ALTER TABLE \`_products_v\` DROP COLUMN \`version_seo_og_image_id\`;`)
  await db.run(sql`ALTER TABLE \`_products_v\` DROP COLUMN \`version_seo_meta_description\`;`)
  await db.run(sql`ALTER TABLE \`_products_v\` DROP COLUMN \`version_seo_meta_title\`;`)
  await db.run(sql`ALTER TABLE \`products_rels\` DROP COLUMN \`faqs_id\`;`)
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`seo_no_index\`;`)
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`seo_og_image_id\`;`)
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`seo_meta_description\`;`)
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`seo_meta_title\`;`)

  await db.run(sql`DROP TABLE \`faqs\`;`)

  await db.run(sql`DROP TABLE \`page_templates_rels\`;`)
  await db.run(sql`DROP TABLE \`page_templates\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`page_templates_blocks_hero\`;`)

  await db.run(sql`DROP TABLE \`_pages_v_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`pages_blocks_faq\`;`)

  await db.run(sql`ALTER TABLE \`_pages_v_rels\` DROP COLUMN \`faqs_id\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_seo_no_index\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_seo_og_image_id\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_seo_meta_description\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_seo_meta_title\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_template_id\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_parent_id\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_is_homepage\`;`)

  await db.run(sql`ALTER TABLE \`pages_rels\` DROP COLUMN \`faqs_id\`;`)

  await db.run(sql`DROP INDEX \`pages_slug_idx\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`pages_slug_idx\` ON \`pages\` (\`slug\`);`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`seo_no_index\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`seo_og_image_id\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`seo_meta_description\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`seo_meta_title\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`template_id\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`parent_id\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`is_homepage\`;`)
}
