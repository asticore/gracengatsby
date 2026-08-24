import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260819_043357_ecommerce_and_events from './20260819_043357_ecommerce_and_events';
import * as migration_20260819_070238_site_settings_pages_and_nav from './20260819_070238_site_settings_pages_and_nav';
import * as migration_20260819_100000_event_registration_url from './20260819_100000_event_registration_url';
import * as migration_20260822_055217_foundation_features from './20260822_055217_foundation_features';
import * as migration_20260822_120000_seed_home_and_templates from './20260822_120000_seed_home_and_templates';
import * as migration_20260822_120859_fix_blocks_rels_tables from './20260822_120859_fix_blocks_rels_tables';
import * as migration_20260822_234701_builder_sections_loops_custom_fields from './20260822_234701_builder_sections_loops_custom_fields';
import * as migration_20260824_020721_settings_globals_and_features from './20260824_020721_settings_globals_and_features';

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
];
