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
 * `socials.links` - same shape, same fix, as header.ts's own doc comment
 * describes in full: both read and write are fully generic now (nestGroups'
 * `extractGroup` on read, ../generic.ts's collectGroupSpecialFields-driven
 * lift inside `splitSpecialFields` on write), driven entirely by
 * `footerGroupFields`'s `socials` entry - no per-global lift needed here.
 */
export const findFooter = ops.find as unknown as () => Promise<FooterDoc | null>
export const updateFooter = ops.update as unknown as (
  data: Partial<Omit<FooterDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<FooterDoc>
