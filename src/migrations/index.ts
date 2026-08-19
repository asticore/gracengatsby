import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260819_043357_ecommerce_and_events from './20260819_043357_ecommerce_and_events';
import * as migration_20260819_100000_event_registration_url from './20260819_100000_event_registration_url';

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260819_043357_ecommerce_and_events.up,
    down: migration_20260819_043357_ecommerce_and_events.down,
    name: '20260819_043357_ecommerce_and_events'
  },
  {
    up: migration_20260819_100000_event_registration_url.up,
    down: migration_20260819_100000_event_registration_url.down,
    name: '20260819_100000_event_registration_url'
  },
];
