import { Footer } from '@/globals/Footer'

import { createGlobalOps } from '../generic'
import { footer, footerColumns, footerColumnsLinks, footerGroupFields, footerSocialsLinks } from '../schema'

/** One `columns[].links[]` item, as Payload's own API returns it - `page` is a plain (non-hasMany, non-polymorphic) `relationship` field targeting `pages` (see header.ts's `HeaderLink` doc comment - same reasoning, this global also has no `_rels` table). `links` is an array nested directly in `columns`' own subfields, not wrapped in a further group - the same shape already proven for FieldGroups'/Forms' `options`. */
export type FooterLink = {
  id: string
  label?: string | null
  linkType?: string | null
  page?: number | null
  customUrl?: string | null
}

export type FooterColumn = { id: string; title?: string | null; links?: FooterLink[] | null }

export type FooterSocialLink = { id: string; platform?: string | null; url?: string | null }

/** Payload's document shape for the `footer` global - see src/globals/Footer.ts. */
export type FooterDoc = {
  id: number
  showLogo?: boolean | null
  layout?: string | null
  bottomText?: string | null
  columns?: FooterColumn[] | null
  contact?: { email?: string | null; phone?: string | null; address?: string | null } | null
  socials?: { show?: boolean | null; links?: FooterSocialLink[] | null } | null
  copyrightText?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(
  footer,
  Footer,
  {
    columns: { table: footerColumns, nestedArrayTables: { links: { table: footerColumnsLinks } } },
    socialsLinks: footerSocialsLinks,
  },
  { groupFields: footerGroupFields },
)

/**
 * `socials.links` - same shape, same gap, same fix as header.ts's own
 * `liftSocialsLinks` (see its doc comment for the full confirmation: reading
 * it back is already generic via nestGroups/`footerGroupFields`'s patched
 * `arrayFieldNames`, writing needs this one lift because flattenGroups never
 * forwards a group's `arrayFieldNames`). Not shared into a common helper -
 * each global's own doc comment carries the full reasoning, matching this
 * data layer's existing per-global ops file convention (no cross-global
 * helper module exists for anything else here either).
 */
function liftSocialsLinks(data: Record<string, unknown>): Record<string, unknown> {
  if (!('socials' in data)) return data
  const { links, ...socialsRest } = (data.socials as { links?: FooterSocialLink[] }) ?? {}
  return { ...data, socials: socialsRest, socialsLinks: links ?? [] }
}

export const findFooter = ops.find as unknown as () => Promise<FooterDoc | null>
export const updateFooter = ((data: Partial<Omit<FooterDoc, 'id' | 'updatedAt' | 'createdAt'>>) =>
  ops.update(liftSocialsLinks(data as Record<string, unknown>))) as unknown as (
  data: Partial<Omit<FooterDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<FooterDoc>
