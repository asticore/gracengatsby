import type { CollectionSlug, Field } from '@/engine'

import { MEMBERSHIP_TIERS_SLUG } from './slugs'

/**
 * `CollectionSlug` is a union generated from engage-types.ts, which is written
 * by `generate:types` from the config. Until the Membership Tiers collection is
 * registered there, the slug is not in the union, so it is asserted here. Once
 * the collections are added and types are regenerated the assertion becomes a
 * no-op - it is left in place so this file compiles either way.
 */
const TIERS_RELATION = MEMBERSHIP_TIERS_SLUG as CollectionSlug

/**
 * The "members only" control, exported so Pages, Posts and Products can all
 * carry exactly the same one.
 *
 * It is a group with a fixed name rather than three loose fields, so the gate
 * can read `doc.membersOnly` from any collection without knowing which one it
 * came from - `evaluateGate` takes anything with this shape.
 *
 * The tier is a relationship, so it only compiles once the Membership Tiers
 * collection is registered. Add this field and the collections in the same
 * change; a relationship pointing at a collection the engine cannot find fails
 * config validation at boot and takes the admin down with it.
 */
export const membersOnlyField: Field = {
  type: 'group',
  name: 'membersOnly',
  label: 'Members only',
  admin: {
    position: 'sidebar',
    description: 'Lock this content to paying members.',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'Members only',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Non-members see the teaser set under Settings > Members instead of the content. The content itself is never sent to them.',
      },
    },
    {
      name: 'tier',
      type: 'relationship',
      relationTo: TIERS_RELATION,
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.enabled),
        description:
          'The lowest tier that can open this. Leave blank to allow any member. Higher tiers always get in.',
      },
    },
  ],
}

/** The shape `evaluateGate` needs off a document. */
export type MembersOnlyValue = {
  enabled?: boolean | null
  tier?: number | string | { id: number | string; slug?: string; name?: string; rank?: number | null } | null
}
