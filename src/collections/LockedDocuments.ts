import type { CollectionConfig } from '@/engine'

/**
 * The reference engine's own internal `engine-locked-documents` collection,
 * reproduced only as far as this app actually needs it.
 *
 * CONFIRMED, DELIBERATE GAP - the `document` field is NOT modeled here.
 * The reference engine's `document` field is genuinely polymorphic (relationTo
 * spans every lockable collection - 25 of them in this app, confirmed by
 * tracing every migration touching `eg_locked_documents_rels`) and picks
 * its target PER ROW, not once per field. `../cms/db/generic.ts`'s
 * `topLevelRelsFieldTargets` mechanism (the only rels-table wiring
 * `createCollectionOps` has) maps one field name to exactly ONE fixed
 * target collection - it has no per-row dispatch, confirmed by reading
 * `attachTopLevelRels`/`writeTopLevelRels`/`readRelsIds`/`writeRelsIds`
 * directly. Modeling `document` faithfully would mean extending that
 * shared machinery (used by every other collection in the app) with a new,
 * genuinely polymorphic write/read path - a high-risk change to core
 * infrastructure for a field with a confirmed-zero caller count (grepped
 * the whole app: no admin-UI document-locking feature exists here at all).
 * Given that, `document` is left off this config entirely rather than
 * faked with an opaque `json` column the real `eg_locked_documents` table
 * does not have (that table's real, confirmed columns are only `id`,
 * `global_slug`, `updated_at`, `created_at` - no `document` column of any
 * kind; the relationship lives solely in `eg_locked_documents_rels`, which
 * this config also does not declare beyond the `user` field below). A
 * caller that tries to read/write `document` on this collection gets
 * `undefined`, not silently-wrong data - flag to whoever adds a real
 * locking feature rather than fixing here.
 *
 * `user` IS modeled, the same way as `Preferences.user` (see that
 * file's header) - `relationTo: ['users']` is the real shape (this app has
 * one auth collection), routed through the shared `eg_locked_documents_rels`
 * table's `eg_users_id` column via `topLevelRelsFieldTargets`.
 *
 * `globalSlug` is a plain column, matching the real table exactly.
 *
 * No `access` block: same reasoning as `Preferences` - falls back to
 * this app's `/api/access` reproduction's `isLoggedIn` default.
 */
export const LockedDocuments: CollectionConfig = {
  slug: 'locked-documents',
  dbName: 'eg_locked_documents',
  fields: [
    { name: 'globalSlug', type: 'text' },
    { name: 'user', type: 'relationship', relationTo: ['users'], required: true },
  ],
}
