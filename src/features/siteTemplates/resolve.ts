import { cache } from 'react'

import { matchesLocation } from '@/features/customFields/location'
import { resolveDocumentContent } from '@/features/customFields/server'
import { getEngine } from '@/lib/engine'

import { sanitizeConditions } from './conditions'
import type { SiteTemplate, SiteTemplateKind, TemplateContext } from './types'

/**
 * Lightweight index of every enabled template, once per request: depth 0, so relations inside blocks are
 * NOT populated (blocks are only used to tell empty templates from real ones). Never throws: a problem
 * reading them means the site renders as it did before templates existed.
 */
export const loadSiteTemplateIndex = cache(async (): Promise<SiteTemplate[]> => {
  try {
    const engine = await getEngine()
    const result = (await engine.find({
      collection: 'site-templates',
      where: { enabled: { equals: true } },
      limit: 100,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })) as unknown as { docs?: SiteTemplate[] }
    return Array.isArray(result?.docs) ? result.docs : []
  } catch {
    return []
  }
})

/** One template with relations populated like pages (depth 2). Cached per request and id; null on any problem. */
export const loadSiteTemplate = cache(async (id: number | string): Promise<SiteTemplate | null> => {
  try {
    const engine = await getEngine()
    const doc = (await engine.findByID({ collection: 'site-templates', id: id as number, depth: 2, overrideAccess: true })) as unknown as SiteTemplate | null
    return doc && Array.isArray(doc.blocks) && doc.blocks.length > 0 ? doc : null
  } catch {
    return null
  }
})

const priorityOf = (template: SiteTemplate): number => (typeof template.priority === 'number' && Number.isFinite(template.priority) ? template.priority : 0)

const idOrder = (a: SiteTemplate, b: SiteTemplate): number => {
  const x = Number(a.id)
  const y = Number(b.id)
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
}

/**
 * The best enabled template of this kind whose conditions match, or null. Highest priority wins, ties go to
 * the lowest id. Templates with no blocks and templates with invalid conditions are skipped before picking.
 * Only the winner is loaded in full.
 */
export async function resolveSiteTemplate(kind: SiteTemplateKind, ctx: TemplateContext = {}): Promise<SiteTemplate | null> {
  try {
    const all = await loadSiteTemplateIndex()
    const full = { ...ctx, templateKind: kind }
    const matching = all.filter((template) => {
      if (template.kind !== kind || template.enabled === false) return false
      if (!Array.isArray(template.blocks) || template.blocks.length === 0) return false
      const { groups, valid } = sanitizeConditions(template.conditions)
      if (!valid) return false
      return groups.length === 0 || matchesLocation(groups, full)
    })
    if (matching.length === 0) return null
    matching.sort((a, b) => priorityOf(b) - priorityOf(a) || idOrder(a, b))
    return await loadSiteTemplate(matching[0].id)
  } catch {
    return null
  }
}

/** The template's blocks after the same pre-render step pages use (merge tags). Empty on any error. */
export async function prepareTemplateBlocks(template: SiteTemplate): Promise<unknown[]> {
  try {
    const resolved = await resolveDocumentContent('pages', template as unknown as Record<string, unknown>)
    const blocks = (resolved as { blocks?: unknown }).blocks
    return Array.isArray(blocks) ? blocks : []
  } catch {
    return []
  }
}