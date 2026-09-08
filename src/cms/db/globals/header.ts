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
 * `group` - a shape nothing in this data layer modeled before Header/Footer
 * (see ../schema/index.ts's `withoutSocialsLinks` doc comment for the full
 * confirmation that generate.ts's processFields throws on it unmodified, and
 * how the `eg_header_socials_links` child table is generated anyway without
 * touching generate.ts).
 *
 * READING it back needs nothing extra here: createGlobalOps' own
 * `attachExtras` runs `attachArrays` (which fetches `socialsLinks` - the
 * synthetic top-level key `headerSocialsLinks` is registered under above -
 * and attaches it onto the doc under that same key) BEFORE `nestGroups`, and
 * nestGroups folds any `arrayFieldNames` entry into its group completely
 * generically regardless of nesting depth (confirmed by reading its
 * implementation directly, not guessed) - driven by `headerGroupFields`'s
 * `socials` entry, patched with `arrayFieldNames: ['links']` in
 * ../schema/index.ts.
 *
 * WRITING does need this one extra step: createGlobalOps' `update()` runs
 * `flattenGroups` on the group scalars, and flattenGroups' own doc comment is
 * explicit that it only ever forwards a group's plain `subFieldNames`, never
 * an `arrayFieldNames` entry (it has no counterpart to createArrayOps'
 * writeArrays, which DOES know how to pull a nested array out of a `groupName`
 * - but only for an array nested inside another ARRAY's own group, e.g.
 * Forms' `conditional.rules`, not a top-level document group). Left
 * unmodified in generic.ts to avoid changing shared write-path code for one
 * field shape on two globals - flagged as a real gap worth generalizing
 * (teaching splitSpecialFields to consult `groupFields[].arrayFieldNames` the
 * same way createArrayOps' writeArrays consults `nestedArrayTables[].groupName`)
 * if a third global ever needs the same shape.
 *
 * So `data.socials.links` is lifted out to the synthetic `socialsLinks`
 * top-level key BEFORE reaching the underlying `update()`, or it would
 * silently vanish (flattenGroups deletes the whole `socials` object off the
 * write payload once it reads out `show`). Whole-group-replace semantics,
 * matching how every other special field in this data layer treats "the key
 * is present in the update payload" as "replace it wholesale" (see
 * createArrayOps/createBlocksRelsOps' own doc comments): passing `socials` at
 * all replaces `socials.links` too, even if only `show` changed - the caller
 * must resend the full desired `links` list (or omit `socials` from the
 * update entirely to leave both untouched), exactly the same contract `menu`
 * already has.
 */
function liftSocialsLinks(data: Record<string, unknown>): Record<string, unknown> {
  if (!('socials' in data)) return data
  const { links, ...socialsRest } = (data.socials as { links?: HeaderSocialLink[] }) ?? {}
  return { ...data, socials: socialsRest, socialsLinks: links ?? [] }
}

export const findHeader = ops.find as unknown as () => Promise<HeaderDoc | null>
export const updateHeader = ((data: Partial<Omit<HeaderDoc, 'id' | 'updatedAt' | 'createdAt'>>) =>
  ops.update(liftSocialsLinks(data as Record<string, unknown>))) as unknown as (
  data: Partial<Omit<HeaderDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<HeaderDoc>
