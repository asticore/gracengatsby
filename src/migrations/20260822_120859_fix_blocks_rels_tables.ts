import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// The `layout`/`introBlocks` blocks fields were added to Products,
// Posts, ShopSettings, BlogSettings, and FaqSettings in earlier migrations,
// but the block-child tables and top-level `_rels` tables those fields
// actually need (one table per block type, e.g. `products_blocks_hero`,
// plus `<slug>_rels` for the hasMany relationship/upload fields nested
// inside blocks like Gallery and FAQ) were never created. Querying any of
// these collections/globals therefore failed in production with a generic
// "Something went wrong" (D1 "no such table"). This migration adds exactly
// those missing tables - generated via the CLI's `migrate:create` against a
// freshly-migrated local D1, then hand-filtered down to only the tables
// that don't already exist (the raw output tries to recreate the entire
// schema, same caveat noted in 20260822_055217_foundation_features.ts).

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`posts_blocks_hero\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`subheading\` text,
  	\`background_image_id\` integer,
  	\`primary_cta_label\` text,
  	\`primary_cta_url\` text,
  	\`secondary_cta_label\` text,
  	\`secondary_cta_url\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`background_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_hero_order_idx\` ON \`posts_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_hero_parent_id_idx\` ON \`posts_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_hero_path_idx\` ON \`posts_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_hero_background_image_idx\` ON \`posts_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`content\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_rich_text_order_idx\` ON \`posts_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_rich_text_parent_id_idx\` ON \`posts_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_rich_text_path_idx\` ON \`posts_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`content\` text,
  	\`image_side\` text DEFAULT 'left',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_image_text_order_idx\` ON \`posts_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_image_text_parent_id_idx\` ON \`posts_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_image_text_path_idx\` ON \`posts_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_image_text_image_idx\` ON \`posts_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_product_grid_order_idx\` ON \`posts_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_product_grid_parent_id_idx\` ON \`posts_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_product_grid_path_idx\` ON \`posts_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_event_grid_order_idx\` ON \`posts_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_event_grid_parent_id_idx\` ON \`posts_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_event_grid_path_idx\` ON \`posts_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_gallery_order_idx\` ON \`posts_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_gallery_parent_id_idx\` ON \`posts_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_gallery_path_idx\` ON \`posts_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_faq_order_idx\` ON \`posts_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_faq_parent_id_idx\` ON \`posts_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_faq_path_idx\` ON \`posts_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`posts_blocks_cta_banner\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`text\` text,
  	\`button_label\` text,
  	\`button_url\` text,
  	\`style\` text DEFAULT 'dark',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_blocks_cta_banner_order_idx\` ON \`posts_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_cta_banner_parent_id_idx\` ON \`posts_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_blocks_cta_banner_path_idx\` ON \`posts_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`posts_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`faqs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faqs_id\`) REFERENCES \`faqs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_rels_order_idx\` ON \`posts_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_parent_idx\` ON \`posts_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_path_idx\` ON \`posts_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_media_id_idx\` ON \`posts_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_faqs_id_idx\` ON \`posts_rels\` (\`faqs_id\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_hero\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`subheading\` text,
  	\`background_image_id\` integer,
  	\`primary_cta_label\` text,
  	\`primary_cta_url\` text,
  	\`secondary_cta_label\` text,
  	\`secondary_cta_url\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`background_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_hero_order_idx\` ON \`_posts_v_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_hero_parent_id_idx\` ON \`_posts_v_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_hero_path_idx\` ON \`_posts_v_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_hero_background_image_idx\` ON \`_posts_v_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`content\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_rich_text_order_idx\` ON \`_posts_v_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_rich_text_parent_id_idx\` ON \`_posts_v_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_rich_text_path_idx\` ON \`_posts_v_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`content\` text,
  	\`image_side\` text DEFAULT 'left',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_image_text_order_idx\` ON \`_posts_v_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_image_text_parent_id_idx\` ON \`_posts_v_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_image_text_path_idx\` ON \`_posts_v_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_image_text_image_idx\` ON \`_posts_v_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_product_grid_order_idx\` ON \`_posts_v_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_product_grid_parent_id_idx\` ON \`_posts_v_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_product_grid_path_idx\` ON \`_posts_v_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_event_grid_order_idx\` ON \`_posts_v_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_event_grid_parent_id_idx\` ON \`_posts_v_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_event_grid_path_idx\` ON \`_posts_v_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_gallery_order_idx\` ON \`_posts_v_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_gallery_parent_id_idx\` ON \`_posts_v_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_gallery_path_idx\` ON \`_posts_v_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_faq_order_idx\` ON \`_posts_v_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_faq_parent_id_idx\` ON \`_posts_v_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_faq_path_idx\` ON \`_posts_v_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_blocks_cta_banner\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`text\` text,
  	\`button_label\` text,
  	\`button_url\` text,
  	\`style\` text DEFAULT 'dark',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_cta_banner_order_idx\` ON \`_posts_v_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_cta_banner_parent_id_idx\` ON \`_posts_v_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_blocks_cta_banner_path_idx\` ON \`_posts_v_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_posts_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`faqs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faqs_id\`) REFERENCES \`faqs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_posts_v_rels_order_idx\` ON \`_posts_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_rels_parent_idx\` ON \`_posts_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_rels_path_idx\` ON \`_posts_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_rels_media_id_idx\` ON \`_posts_v_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`_posts_v_rels_faqs_id_idx\` ON \`_posts_v_rels\` (\`faqs_id\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_hero\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`subheading\` text,
  	\`background_image_id\` integer,
  	\`primary_cta_label\` text,
  	\`primary_cta_url\` text,
  	\`secondary_cta_label\` text,
  	\`secondary_cta_url\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`background_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_hero_order_idx\` ON \`products_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_hero_parent_id_idx\` ON \`products_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_hero_path_idx\` ON \`products_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_hero_background_image_idx\` ON \`products_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`content\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_rich_text_order_idx\` ON \`products_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_rich_text_parent_id_idx\` ON \`products_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_rich_text_path_idx\` ON \`products_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`content\` text,
  	\`image_side\` text DEFAULT 'left',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_image_text_order_idx\` ON \`products_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_image_text_parent_id_idx\` ON \`products_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_image_text_path_idx\` ON \`products_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_image_text_image_idx\` ON \`products_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_product_grid_order_idx\` ON \`products_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_product_grid_parent_id_idx\` ON \`products_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_product_grid_path_idx\` ON \`products_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_event_grid_order_idx\` ON \`products_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_event_grid_parent_id_idx\` ON \`products_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_event_grid_path_idx\` ON \`products_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_gallery_order_idx\` ON \`products_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_gallery_parent_id_idx\` ON \`products_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_gallery_path_idx\` ON \`products_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_faq_order_idx\` ON \`products_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_faq_parent_id_idx\` ON \`products_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_faq_path_idx\` ON \`products_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`products_blocks_cta_banner\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`text\` text,
  	\`button_label\` text,
  	\`button_url\` text,
  	\`style\` text DEFAULT 'dark',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_blocks_cta_banner_order_idx\` ON \`products_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_cta_banner_parent_id_idx\` ON \`products_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_blocks_cta_banner_path_idx\` ON \`products_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_hero\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`subheading\` text,
  	\`background_image_id\` integer,
  	\`primary_cta_label\` text,
  	\`primary_cta_url\` text,
  	\`secondary_cta_label\` text,
  	\`secondary_cta_url\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`background_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_hero_order_idx\` ON \`_products_v_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_hero_parent_id_idx\` ON \`_products_v_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_hero_path_idx\` ON \`_products_v_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_hero_background_image_idx\` ON \`_products_v_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`content\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_rich_text_order_idx\` ON \`_products_v_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_rich_text_parent_id_idx\` ON \`_products_v_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_rich_text_path_idx\` ON \`_products_v_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`content\` text,
  	\`image_side\` text DEFAULT 'left',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_image_text_order_idx\` ON \`_products_v_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_image_text_parent_id_idx\` ON \`_products_v_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_image_text_path_idx\` ON \`_products_v_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_image_text_image_idx\` ON \`_products_v_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_product_grid_order_idx\` ON \`_products_v_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_product_grid_parent_id_idx\` ON \`_products_v_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_product_grid_path_idx\` ON \`_products_v_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_event_grid_order_idx\` ON \`_products_v_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_event_grid_parent_id_idx\` ON \`_products_v_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_event_grid_path_idx\` ON \`_products_v_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_gallery_order_idx\` ON \`_products_v_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_gallery_parent_id_idx\` ON \`_products_v_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_gallery_path_idx\` ON \`_products_v_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_faq_order_idx\` ON \`_products_v_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_faq_parent_id_idx\` ON \`_products_v_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_faq_path_idx\` ON \`_products_v_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_blocks_cta_banner\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`text\` text,
  	\`button_label\` text,
  	\`button_url\` text,
  	\`style\` text DEFAULT 'dark',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_cta_banner_order_idx\` ON \`_products_v_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_cta_banner_parent_id_idx\` ON \`_products_v_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_blocks_cta_banner_path_idx\` ON \`_products_v_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_hero\` (
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
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_hero_order_idx\` ON \`blog_settings_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_hero_parent_id_idx\` ON \`blog_settings_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_hero_path_idx\` ON \`blog_settings_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_hero_background_image_idx\` ON \`blog_settings_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`content\` text NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_rich_text_order_idx\` ON \`blog_settings_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_rich_text_parent_id_idx\` ON \`blog_settings_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_rich_text_path_idx\` ON \`blog_settings_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer NOT NULL,
  	\`content\` text NOT NULL,
  	\`image_side\` text DEFAULT 'left',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_image_text_order_idx\` ON \`blog_settings_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_image_text_parent_id_idx\` ON \`blog_settings_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_image_text_path_idx\` ON \`blog_settings_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_image_text_image_idx\` ON \`blog_settings_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_product_grid_order_idx\` ON \`blog_settings_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_product_grid_parent_id_idx\` ON \`blog_settings_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_product_grid_path_idx\` ON \`blog_settings_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_event_grid_order_idx\` ON \`blog_settings_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_event_grid_parent_id_idx\` ON \`blog_settings_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_event_grid_path_idx\` ON \`blog_settings_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_gallery_order_idx\` ON \`blog_settings_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_gallery_parent_id_idx\` ON \`blog_settings_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_gallery_path_idx\` ON \`blog_settings_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_faq_order_idx\` ON \`blog_settings_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_faq_parent_id_idx\` ON \`blog_settings_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_faq_path_idx\` ON \`blog_settings_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_blocks_cta_banner\` (
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
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_cta_banner_order_idx\` ON \`blog_settings_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_cta_banner_parent_id_idx\` ON \`blog_settings_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_blocks_cta_banner_path_idx\` ON \`blog_settings_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`blog_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`faqs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`blog_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faqs_id\`) REFERENCES \`faqs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_settings_rels_order_idx\` ON \`blog_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_rels_parent_idx\` ON \`blog_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_rels_path_idx\` ON \`blog_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_rels_media_id_idx\` ON \`blog_settings_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_settings_rels_faqs_id_idx\` ON \`blog_settings_rels\` (\`faqs_id\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_hero\` (
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
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_hero_order_idx\` ON \`faq_settings_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_hero_parent_id_idx\` ON \`faq_settings_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_hero_path_idx\` ON \`faq_settings_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_hero_background_image_idx\` ON \`faq_settings_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`content\` text NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_rich_text_order_idx\` ON \`faq_settings_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_rich_text_parent_id_idx\` ON \`faq_settings_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_rich_text_path_idx\` ON \`faq_settings_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer NOT NULL,
  	\`content\` text NOT NULL,
  	\`image_side\` text DEFAULT 'left',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_image_text_order_idx\` ON \`faq_settings_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_image_text_parent_id_idx\` ON \`faq_settings_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_image_text_path_idx\` ON \`faq_settings_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_image_text_image_idx\` ON \`faq_settings_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_product_grid_order_idx\` ON \`faq_settings_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_product_grid_parent_id_idx\` ON \`faq_settings_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_product_grid_path_idx\` ON \`faq_settings_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_event_grid_order_idx\` ON \`faq_settings_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_event_grid_parent_id_idx\` ON \`faq_settings_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_event_grid_path_idx\` ON \`faq_settings_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_gallery_order_idx\` ON \`faq_settings_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_gallery_parent_id_idx\` ON \`faq_settings_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_gallery_path_idx\` ON \`faq_settings_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_faq_order_idx\` ON \`faq_settings_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_faq_parent_id_idx\` ON \`faq_settings_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_faq_path_idx\` ON \`faq_settings_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_blocks_cta_banner\` (
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
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_cta_banner_order_idx\` ON \`faq_settings_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_cta_banner_parent_id_idx\` ON \`faq_settings_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_blocks_cta_banner_path_idx\` ON \`faq_settings_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`faq_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`faqs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`faq_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faqs_id\`) REFERENCES \`faqs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`faq_settings_rels_order_idx\` ON \`faq_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_rels_parent_idx\` ON \`faq_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_rels_path_idx\` ON \`faq_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_rels_media_id_idx\` ON \`faq_settings_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`faq_settings_rels_faqs_id_idx\` ON \`faq_settings_rels\` (\`faqs_id\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_hero\` (
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
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_hero_order_idx\` ON \`shop_settings_blocks_hero\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_hero_parent_id_idx\` ON \`shop_settings_blocks_hero\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_hero_path_idx\` ON \`shop_settings_blocks_hero\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_hero_background_image_idx\` ON \`shop_settings_blocks_hero\` (\`background_image_id\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_rich_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`content\` text NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_rich_text_order_idx\` ON \`shop_settings_blocks_rich_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_rich_text_parent_id_idx\` ON \`shop_settings_blocks_rich_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_rich_text_path_idx\` ON \`shop_settings_blocks_rich_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_image_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer NOT NULL,
  	\`content\` text NOT NULL,
  	\`image_side\` text DEFAULT 'left',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_image_text_order_idx\` ON \`shop_settings_blocks_image_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_image_text_parent_id_idx\` ON \`shop_settings_blocks_image_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_image_text_path_idx\` ON \`shop_settings_blocks_image_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_image_text_image_idx\` ON \`shop_settings_blocks_image_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_product_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`category\` text,
  	\`limit\` numeric DEFAULT 4,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_product_grid_order_idx\` ON \`shop_settings_blocks_product_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_product_grid_parent_id_idx\` ON \`shop_settings_blocks_product_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_product_grid_path_idx\` ON \`shop_settings_blocks_product_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_event_grid\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`show_past\` integer DEFAULT false,
  	\`limit\` numeric DEFAULT 3,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_event_grid_order_idx\` ON \`shop_settings_blocks_event_grid\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_event_grid_parent_id_idx\` ON \`shop_settings_blocks_event_grid\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_event_grid_path_idx\` ON \`shop_settings_blocks_event_grid\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_gallery_order_idx\` ON \`shop_settings_blocks_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_gallery_parent_id_idx\` ON \`shop_settings_blocks_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_gallery_path_idx\` ON \`shop_settings_blocks_gallery\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`heading\` text DEFAULT 'Frequently asked questions',
  	\`source\` text DEFAULT 'category',
  	\`category\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_faq_order_idx\` ON \`shop_settings_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_faq_parent_id_idx\` ON \`shop_settings_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_faq_path_idx\` ON \`shop_settings_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_blocks_cta_banner\` (
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
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_cta_banner_order_idx\` ON \`shop_settings_blocks_cta_banner\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_cta_banner_parent_id_idx\` ON \`shop_settings_blocks_cta_banner\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_blocks_cta_banner_path_idx\` ON \`shop_settings_blocks_cta_banner\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`shop_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`faqs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`shop_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faqs_id\`) REFERENCES \`faqs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`shop_settings_rels_order_idx\` ON \`shop_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_rels_parent_idx\` ON \`shop_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_rels_path_idx\` ON \`shop_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_rels_media_id_idx\` ON \`shop_settings_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`shop_settings_rels_faqs_id_idx\` ON \`shop_settings_rels\` (\`faqs_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`shop_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`shop_settings_blocks_hero\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`faq_settings_blocks_hero\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`blog_settings_blocks_hero\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`_products_v_blocks_hero\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`products_blocks_hero\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_rels\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`_posts_v_blocks_hero\`;`)
  await db.run(sql`DROP TABLE \`posts_rels\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_cta_banner\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_gallery\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_event_grid\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_product_grid\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_image_text\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_rich_text\`;`)
  await db.run(sql`DROP TABLE \`posts_blocks_hero\`;`)
}
