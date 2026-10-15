import type { SiteTemplateKind } from '@/collections/SiteTemplates'
import type { LocationContext } from '@/features/customFields/location'
import type { LocationGroups } from '@/fields/customFields/types'

export type { SiteTemplateKind }

/** The part of a site-templates row the resolver and renderer use. */
export type SiteTemplate = {
  id: number | string
  name?: string | null
  kind: SiteTemplateKind
  enabled?: boolean | null
  priority?: number | null
  conditions?: unknown
  blocks?: unknown[] | null
}

/** What a template's conditions are matched against. `templateKind` is always set by the resolver. */
export type TemplateContext = Omit<LocationContext, 'templateKind'>

export type TemplateConditions = LocationGroups