import type { CollectionConfig } from '@/engine'

import { PREFERENCES_SLUG } from '@/features/accounts/types'

/**
 * Real Payload's own internal `payload-preferences` collection, reproduced
 * just enough to back this app's local `engine.find/create/update` calls
 * (`src/features/accounts/preferences.ts`, `AdminNav.tsx`, `NavGroup.tsx` -
 * confirmed the only real callers, all via the plain Local API, never the
 * REST `/:key` convenience endpoint real Payload also exposes - that
 * endpoint is deliberately NOT reproduced here, see rest.ts's header for
 * why).
 *
 * FIDELITY NOTE - the `user` field: real Payload declares this as
 * `relationTo: [...every auth-enabled collection]`, which is why the real
 * `eg_preferences` table has NO `user_id` column of its own and instead
 * carries the relationship through the shared `eg_preferences_rels` table
 * (confirmed by tracing every migration in `src/migrations/index.ts` - see
 * the plan doc's architecture-reference section). This app has exactly one
 * auth collection (`users`), so `relationTo: ['users']` here is not a
 * simplification - it is the exact real shape, just with a one-element
 * array instead of Payload's own multi-collection one. Declaring it as an
 * array (rather than a plain single-target `relationTo: 'users'`) is what
 * routes it through `generateRelsTable`/`createCollectionOps`'s
 * `topLevelRelsFieldTargets` machinery instead of a plain `user_id` column -
 * see ../cms/db/schema/index.ts's `preferencesGenerated` and
 * ../cms/db/collections/preferences.ts.
 *
 * `key`/`value` are plain columns, matching the real `eg_preferences` table
 * exactly (id, key, value, updated_at, created_at - confirmed, no other
 * columns exist).
 *
 * No `access` block is declared: real Payload restricts read/update/delete
 * to the owning user and leaves create to any logged-in user via a
 * dedicated access function this app has no caller that depends on (see
 * `preferences.ts`'s own header - every write already locates its row
 * through an access-enforced read first). Omitting `access` here falls back
 * to this app's own `/api/access` reproduction's documented default
 * (`isLoggedIn` for every operation - see `src/localapi/rest.ts`'s
 * `callAccessFn`), a safe, documented approximation rather than a fabricated
 * per-row ownership rule nothing in this app currently needs.
 */
export const PayloadPreferences: CollectionConfig = {
  slug: PREFERENCES_SLUG,
  dbName: 'eg_preferences',
  fields: [
    { name: 'user', type: 'relationship', relationTo: ['users'], required: true },
    { name: 'key', type: 'text' },
    { name: 'value', type: 'json' },
  ],
}
