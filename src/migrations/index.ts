import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260819_043357_ecommerce_and_events from './20260819_043357_ecommerce_and_events';
import * as migration_20260819_070238_site_settings_pages_and_nav from './20260819_070238_site_settings_pages_and_nav';
import * as migration_20260819_100000_event_registration_url from './20260819_100000_event_registration_url';
import * as migration_20260822_055217_foundation_features from './20260822_055217_foundation_features';
import * as migration_20260822_120000_seed_home_and_templates from './20260822_120000_seed_home_and_templates';
import * as migration_20260822_120859_fix_blocks_rels_tables from './20260822_120859_fix_blocks_rels_tables';
import * as migration_20260822_234701_builder_sections_loops_custom_fields from './20260822_234701_builder_sections_loops_custom_fields';
import * as migration_20260824_020721_settings_globals_and_features from './20260824_020721_settings_globals_and_features';
import * as migration_20260825_033000_rename_tables_eg_prefix from './20260825_033000_rename_tables_eg_prefix';
import * as migration_20260826_090000_rename_engine_tables from './20260826_090000_rename_engine_tables';
import * as migration_20260827_100000_security_audit_log from './20260827_100000_security_audit_log';
import * as migration_20260828_110000_forms from './20260828_110000_forms';
import * as migration_20260828_120000_multilingual from './20260828_120000_multilingual';
import * as migration_20260828_130000_backups from './20260828_130000_backups';
import * as migration_20260830_110000_members from './20260830_110000_members';
import * as migration_20260830_120000_courses from './20260830_120000_courses';
import * as migration_20260830_130000_ab_testing from './20260830_130000_ab_testing';
import * as migration_20261002_100000_seo_social_fields from './20261002_100000_seo_social_fields';
import * as migration_20261002_120000_authorship_page_type_product_seo from './20261002_120000_authorship_page_type_product_seo';
import * as migration_20261003_100000_visibility_schedule_lock_events_seo from './20261003_100000_visibility_schedule_lock_events_seo';
import * as migration_20261005_100000_redirects from './20261005_100000_redirects';
import * as migration_20261005_110000_pages_sort_order from './20261005_110000_pages_sort_order';
import * as migration_20261006_100000_roles from './20261006_100000_roles';
import * as migration_20261007_100000_users_authorship from './20261007_100000_users_authorship';
import * as migration_20261008_100000_integrations_expand from './20261008_100000_integrations_expand';
import * as migration_20261009_100000_user_permission_overrides from './20261009_100000_user_permission_overrides';
import * as migration_20261010_100000_site_fonts from './20261010_100000_site_fonts';

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260819_043357_ecommerce_and_events.up,
    down: migration_20260819_043357_ecommerce_and_events.down,
    name: '20260819_043357_ecommerce_and_events',
  },
  {
    up: migration_20260819_070238_site_settings_pages_and_nav.up,
    down: migration_20260819_070238_site_settings_pages_and_nav.down,
    name: '20260819_070238_site_settings_pages_and_nav',
  },
  {
    up: migration_20260819_100000_event_registration_url.up,
    down: migration_20260819_100000_event_registration_url.down,
    name: '20260819_100000_event_registration_url',
  },
  {
    up: migration_20260822_055217_foundation_features.up,
    down: migration_20260822_055217_foundation_features.down,
    name: '20260822_055217_foundation_features',
  },
  {
    up: migration_20260822_120000_seed_home_and_templates.up,
    down: migration_20260822_120000_seed_home_and_templates.down,
    name: '20260822_120000_seed_home_and_templates',
  },
  {
    up: migration_20260822_120859_fix_blocks_rels_tables.up,
    down: migration_20260822_120859_fix_blocks_rels_tables.down,
    name: '20260822_120859_fix_blocks_rels_tables',
  },
  {
    up: migration_20260822_234701_builder_sections_loops_custom_fields.up,
    down: migration_20260822_234701_builder_sections_loops_custom_fields.down,
    name: '20260822_234701_builder_sections_loops_custom_fields',
  },
  {
    up: migration_20260824_020721_settings_globals_and_features.up,
    down: migration_20260824_020721_settings_globals_and_features.down,
    name: '20260824_020721_settings_globals_and_features'
  },
  {
    up: migration_20260825_033000_rename_tables_eg_prefix.up,
    down: migration_20260825_033000_rename_tables_eg_prefix.down,
    name: '20260825_033000_rename_tables_eg_prefix',
  },
  {
    up: migration_20260826_090000_rename_engine_tables.up,
    down: migration_20260826_090000_rename_engine_tables.down,
    name: '20260826_090000_rename_engine_tables',
  },
  {
    up: migration_20260827_100000_security_audit_log.up,
    down: migration_20260827_100000_security_audit_log.down,
    name: '20260827_100000_security_audit_log',
  },
  {
    up: migration_20260828_110000_forms.up,
    down: migration_20260828_110000_forms.down,
    name: '20260828_110000_forms',
  },
  {
    up: migration_20260828_120000_multilingual.up,
    down: migration_20260828_120000_multilingual.down,
    name: '20260828_120000_multilingual',
  },
  {
    up: migration_20260828_130000_backups.up,
    down: migration_20260828_130000_backups.down,
    name: '20260828_130000_backups',
  },
  {
    up: migration_20260830_110000_members.up,
    down: migration_20260830_110000_members.down,
    name: '20260830_110000_members',
  },
  {
    up: migration_20260830_120000_courses.up,
    down: migration_20260830_120000_courses.down,
    name: '20260830_120000_courses',
  },
  {
    up: migration_20260830_130000_ab_testing.up,
    down: migration_20260830_130000_ab_testing.down,
    name: '20260830_130000_ab_testing',
  },
  {
    up: migration_20261002_100000_seo_social_fields.up,
    down: migration_20261002_100000_seo_social_fields.down,
    name: '20261002_100000_seo_social_fields',
  },
  {
    up: migration_20261002_120000_authorship_page_type_product_seo.up,
    down: migration_20261002_120000_authorship_page_type_product_seo.down,
    name: '20261002_120000_authorship_page_type_product_seo',
  },
  {
    up: migration_20261003_100000_visibility_schedule_lock_events_seo.up,
    down: migration_20261003_100000_visibility_schedule_lock_events_seo.down,
    name: '20261003_100000_visibility_schedule_lock_events_seo',
  },
  {
    up: migration_20261005_100000_redirects.up,
    down: migration_20261005_100000_redirects.down,
    name: '20261005_100000_redirects',
  },
  {
    up: migration_20261005_110000_pages_sort_order.up,
    down: migration_20261005_110000_pages_sort_order.down,
    name: '20261005_110000_pages_sort_order',
  },
  {
    up: migration_20261006_100000_roles.up,
    down: migration_20261006_100000_roles.down,
    name: '20261006_100000_roles',
  },
  {
    up: migration_20261007_100000_users_authorship.up,
    down: migration_20261007_100000_users_authorship.down,
    name: '20261007_100000_users_authorship',
  },
  {
    up: migration_20261008_100000_integrations_expand.up,
    down: migration_20261008_100000_integrations_expand.down,
    name: '20261008_100000_integrations_expand',
  },
  {
    up: migration_20261009_100000_user_permission_overrides.up,
    down: migration_20261009_100000_user_permission_overrides.down,
    name: '20261009_100000_user_permission_overrides',
  },
  {
    up: migration_20261010_100000_site_fonts.up,
    down: migration_20261010_100000_site_fonts.down,
    name: '20261010_100000_site_fonts',
  },
];