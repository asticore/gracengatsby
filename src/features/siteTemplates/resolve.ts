import { cache } from 'react'

import { resolveDocumentContent } from '@/features/customFields/server'
import { getEngine } from '@/lib/engine'

import { pickSiteTemplate } from './pick'
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

/**
 * The best enabled template of this kind whose conditions match, or null. Only the winner is loaded in full.
 * Never throws: a problem reading the templates means no template (the site draws its defaults).
 */
export async function resolveSiteTemplate(kind: SiteTemplateKind, ctx: TemplateContext = {}): Promise<SiteTemplate | null> {
  try {
    const winner = pickSiteTemplate(await loadSiteTemplateIndex(), kind, ctx)
    return winner ? await loadSiteTemplate(winner.id) : null
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