import type { CollectionSlug, Engine } from '@/engine'

/**
 * The two collection slugs this feature owns, cast once.
 *
 * `CollectionSlug` is a union generated from engage-types.ts, which is rebuilt
 * from the config - so `forms` and `form-submissions` are only members of it
 * after the collections have been added to the config AND types regenerated.
 * Until that build runs, every `collection: 'forms'` in the feature is a type
 * error, and after it runs they are all fine.
 *
 * Casting here rather than at each call site means the feature type-checks
 * before it is wired in and stays correct after, and there is exactly one place
 * to delete once the generated types catch up.
 */
export const FORMS_SLUG = 'forms' as CollectionSlug
export const SUBMISSIONS_SLUG = 'form-submissions' as CollectionSlug

/**
 * The argument shapes for `create` and `update`. Both are generic over the
 * collection slug and so, for exactly the reason above, neither yet admits a
 * form entry. The two writes in this feature are cast through these, and the
 * casts disappear with the two slugs.
 */
export type CreateArgs = Parameters<Engine['create']>[0]
export type UpdateArgs = Parameters<Engine['update']>[0]
