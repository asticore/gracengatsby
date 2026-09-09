import { Header } from '@/globals/Header'

import { createGlobalOps } from '../generic'
import { header, headerGroupFields, headerMenu, headerMenuChildren, headerSocialsLinks } from '../schema'

/**
 * One `menu`/`children` link item, as Payload's own API returns it - `page`
 * is a plain (non-hasMany, non-polymorphic) `relationship` field targeting
 * `pages`, so it comes back as a bare id column value, the exact same
 * convention every other single-target relationship field in this data layer
 * already uses (confirmed via ../schema/generate.ts's columnFor/
 * isHasManyRelational: only hasMany/polymorphic relationship fields get
 * routed through a `_rels` table - Header declares none, so this global has
 * no `_rels` table at all).
 */
export type HeaderLink = {
  id: string
  label?: string | null
  linkType?: string | null
  page?: number | null
  customUrl?: string | null
  openInNewTab?: boolean | null
}

/** `menu`'s own array items additionally carry `children` - a SECOND array nested directly in `menu`'s own subfields (not wrapped in a further group), the exact shape already proven for FieldGroups'/Forms' `options` (see ../schema/generate.ts's generateArrayTable doc comment) - `linkFields(false)` in src/globals/Header.ts stops the recursion at one level, so `children` itself never has a further `children`. */
export type HeaderMenuItem = HeaderLink & { children?: HeaderLink[] | null }

export type HeaderSocialLink = { id: string; platform?: string | null; url?: string | null }

/** Payload's document shape for the `header` global - see src/globals/Header.ts. */
export type HeaderDoc = {
  id: number
  showLogo?: boolean | null
  sticky?: boolean | null
  showCart?: boolean | null
  desktopLayout?: string | null
  mobileLayout?: string | null
  announcementBar?: {
    enabled?: boolean | null
    text?: string | null
    linkUrl?: string | null
    dismissible?: boolean | null
  } | null
  menu?: HeaderMenuItem[] | null
  socials?: { show?: boolean | null; links?: HeaderSocialLink[] | null } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(
  header,
  Header,
  {
    menu: { table: headerMenu, nestedArrayTables: { children: { table: headerMenuChildren } } },
    socialsLinks: headerSocialsLinks,
  },
  { groupFields: headerGroupFields },
)

/**
 * `socials.links` is an `array` field living directly inside a top-level
 * `group` (Phase 20's Gap A1 - confirmed against the real
 * `eg_header_socials_links` table). Both directions are now fully generic,
 * no per-global lift needed here:
 *
 * READING: createGlobalOps' own `attachExtras` runs `attachArrays` (which
 * fetches the child table registered under the synthetic `socialsLinks` key
 * above and attaches it onto the doc under that same key) BEFORE
 * `nestGroups`, and nestGroups' `extractGroup` folds any `arrayFieldNames`
 * entry into its group generically at any nesting depth - driven by
 * `headerGroupFields`'s `socials` entry (`arrayFieldNames: ['links']`),
 * computed directly by ../schema/generate.ts's processGroupField, not
 * patched by hand.
 *
 * WRITING: createGlobalOps' `update()`/`create()` call `splitSpecialFields`,
 * which now lifts every group-nested array/select value (derived from
 * `groupFields` alone via ../generic.ts's collectGroupSpecialFields) out to
 * its synthetic top-level key BEFORE `flattenGroups` ever sees the group -
 * so `data.socials.links` reaches the `socialsLinks` array table with no
 * caller-side lifting. Whole-group-replace semantics, matching how every
 * other special field in this data layer treats "the key is present in the
 * update payload" as "replace it wholesale": passing `socials` at all
 * replaces `socials.links` too (defaulting to empty if omitted), even if
 * only `show` changed - the caller must resend the full desired `links` list
 * (or omit `socials` from the update entirely to leave both untouched),
 * exactly the same contract `menu` already has.
 */
export const findHeader = ops.find as unknown as () => Promise<HeaderDoc | null>
export const updateHeader = ops.update as unknown as (
  data: Partial<Omit<HeaderDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<HeaderDoc>
