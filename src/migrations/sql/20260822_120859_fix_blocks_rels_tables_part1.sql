-- Part 1 of 4 - idempotent copy of 20260822_120859_fix_blocks_rels_tables.ts's
-- up() migration, applied directly to real production D1 via
-- `wrangler d1 execute --remote` in deploy:database (see package.json),
-- because payload migrate's Cloudflare binding proxy only reaches a local
-- emulated D1 during CI, not the real one. Safe to re-run every deploy:
-- every statement uses IF NOT EXISTS. Split into 4 files to keep each one
-- small enough to review/edit reliably.

CREATE TABLE IF NOT EXISTS `posts_blocks_hero` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`heading` text,
  	`subheading` text,
  	`background_image_id` integer,
  	`primary_cta_label` text,
  	`primary_cta_url` text,
  	`secondary_cta_label` text,
  	`secondary_cta_url` text,
  	`block_name` text,
  	FOREIGN KEY (`background_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_hero_order_idx` ON `posts_blocks_hero` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_hero_parent_id_idx` ON `posts_blocks_hero` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_hero_path_idx` ON `posts_blocks_hero` (`_path`);

CREATE INDEX IF NOT EXISTS `posts_blocks_hero_background_image_idx` ON `posts_blocks_hero` (`background_image_id`);

CREATE TABLE IF NOT EXISTS `posts_blocks_rich_text` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`content` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_rich_text_order_idx` ON `posts_blocks_rich_text` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_rich_text_parent_id_idx` ON `posts_blocks_rich_text` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_rich_text_path_idx` ON `posts_blocks_rich_text` (`_path`);

CREATE TABLE IF NOT EXISTS `posts_blocks_image_text` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`image_id` integer,
  	`content` text,
  	`image_side` text DEFAULT 'left',
  	`block_name` text,
  	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_image_text_order_idx` ON `posts_blocks_image_text` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_image_text_parent_id_idx` ON `posts_blocks_image_text` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_image_text_path_idx` ON `posts_blocks_image_text` (`_path`);

CREATE INDEX IF NOT EXISTS `posts_blocks_image_text_image_idx` ON `posts_blocks_image_text` (`image_id`);

CREATE TABLE IF NOT EXISTS `posts_blocks_product_grid` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`heading` text,
  	`category` text,
  	`limit` numeric DEFAULT 4,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_product_grid_order_idx` ON `posts_blocks_product_grid` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_product_grid_parent_id_idx` ON `posts_blocks_product_grid` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_product_grid_path_idx` ON `posts_blocks_product_grid` (`_path`);

CREATE TABLE IF NOT EXISTS `posts_blocks_event_grid` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`heading` text,
  	`show_past` integer DEFAULT false,
  	`limit` numeric DEFAULT 3,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_event_grid_order_idx` ON `posts_blocks_event_grid` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_event_grid_parent_id_idx` ON `posts_blocks_event_grid` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_event_grid_path_idx` ON `posts_blocks_event_grid` (`_path`);

CREATE TABLE IF NOT EXISTS `posts_blocks_gallery` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`heading` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_gallery_order_idx` ON `posts_blocks_gallery` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_gallery_parent_id_idx` ON `posts_blocks_gallery` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_gallery_path_idx` ON `posts_blocks_gallery` (`_path`);

CREATE TABLE IF NOT EXISTS `posts_blocks_faq` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`heading` text DEFAULT 'Frequently asked questions',
  	`source` text DEFAULT 'category',
  	`category` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_faq_order_idx` ON `posts_blocks_faq` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_faq_parent_id_idx` ON `posts_blocks_faq` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_faq_path_idx` ON `posts_blocks_faq` (`_path`);

CREATE TABLE IF NOT EXISTS `posts_blocks_cta_banner` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` text PRIMARY KEY NOT NULL,
  	`heading` text,
  	`text` text,
  	`button_label` text,
  	`button_url` text,
  	`style` text DEFAULT 'dark',
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_blocks_cta_banner_order_idx` ON `posts_blocks_cta_banner` (`_order`);

CREATE INDEX IF NOT EXISTS `posts_blocks_cta_banner_parent_id_idx` ON `posts_blocks_cta_banner` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `posts_blocks_cta_banner_path_idx` ON `posts_blocks_cta_banner` (`_path`);

CREATE TABLE IF NOT EXISTS `posts_rels` (
  	`id` integer PRIMARY KEY NOT NULL,
  	`order` integer,
  	`parent_id` integer NOT NULL,
  	`path` text NOT NULL,
  	`media_id` integer,
  	`faqs_id` integer,
  	FOREIGN KEY (`parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (`faqs_id`) REFERENCES `faqs`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `posts_rels_order_idx` ON `posts_rels` (`order`);

CREATE INDEX IF NOT EXISTS `posts_rels_parent_idx` ON `posts_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `posts_rels_path_idx` ON `posts_rels` (`path`);

CREATE INDEX IF NOT EXISTS `posts_rels_media_id_idx` ON `posts_rels` (`media_id`);

CREATE INDEX IF NOT EXISTS `posts_rels_faqs_id_idx` ON `posts_rels` (`faqs_id`);

CREATE TABLE IF NOT EXISTS `_posts_v_blocks_hero` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` integer PRIMARY KEY NOT NULL,
  	`heading` text,
  	`subheading` text,
  	`background_image_id` integer,
  	`primary_cta_label` text,
  	`primary_cta_url` text,
  	`secondary_cta_label` text,
  	`secondary_cta_url` text,
  	`_uuid` text,
  	`block_name` text,
  	FOREIGN KEY (`background_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_hero_order_idx` ON `_posts_v_blocks_hero` (`_order`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_hero_parent_id_idx` ON `_posts_v_blocks_hero` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_hero_path_idx` ON `_posts_v_blocks_hero` (`_path`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_hero_background_image_idx` ON `_posts_v_blocks_hero` (`background_image_id`);

CREATE TABLE IF NOT EXISTS `_posts_v_blocks_rich_text` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` integer PRIMARY KEY NOT NULL,
  	`content` text,
  	`_uuid` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_rich_text_order_idx` ON `_posts_v_blocks_rich_text` (`_order`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_rich_text_parent_id_idx` ON `_posts_v_blocks_rich_text` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_rich_text_path_idx` ON `_posts_v_blocks_rich_text` (`_path`);

CREATE TABLE IF NOT EXISTS `_posts_v_blocks_image_text` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` integer PRIMARY KEY NOT NULL,
  	`image_id` integer,
  	`content` text,
  	`image_side` text DEFAULT 'left',
  	`_uuid` text,
  	`block_name` text,
  	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_image_text_order_idx` ON `_posts_v_blocks_image_text` (`_order`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_image_text_parent_id_idx` ON `_posts_v_blocks_image_text` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_image_text_path_idx` ON `_posts_v_blocks_image_text` (`_path`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_image_text_image_idx` ON `_posts_v_blocks_image_text` (`image_id`);

CREATE TABLE IF NOT EXISTS `_posts_v_blocks_product_grid` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` integer PRIMARY KEY NOT NULL,
  	`heading` text,
  	`category` text,
  	`limit` numeric DEFAULT 4,
  	`_uuid` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_product_grid_order_idx` ON `_posts_v_blocks_product_grid` (`_order`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_product_grid_parent_id_idx` ON `_posts_v_blocks_product_grid` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_product_grid_path_idx` ON `_posts_v_blocks_product_grid` (`_path`);

CREATE TABLE IF NOT EXISTS `_posts_v_blocks_event_grid` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` integer PRIMARY KEY NOT NULL,
  	`heading` text,
  	`show_past` integer DEFAULT false,
  	`limit` numeric DEFAULT 3,
  	`_uuid` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_event_grid_order_idx` ON `_posts_v_blocks_event_grid` (`_order`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_event_grid_parent_id_idx` ON `_posts_v_blocks_event_grid` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_event_grid_path_idx` ON `_posts_v_blocks_event_grid` (`_path`);

CREATE TABLE IF NOT EXISTS `_posts_v_blocks_gallery` (
  	`_order` integer NOT NULL,
  	`_parent_id` integer NOT NULL,
  	`_path` text NOT NULL,
  	`id` integer PRIMARY KEY NOT NULL,
  	`heading` text,
  	`_uuid` text,
  	`block_name` text,
  	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_gallery_order_idx` ON `_posts_v_blocks_gallery` (`_order`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_gallery_parent_id_idx` ON `_posts_v_blocks_gallery` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_blocks_gallery_path_idx` ON `_posts_v_blocks_gallery` (`_path`);
