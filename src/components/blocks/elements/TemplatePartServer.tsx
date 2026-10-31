import React from 'react'

import { parseTemplatePartId, stripPartNesting } from '@/features/siteTemplates/nodes'
import { renderTemplateBlocks } from '@/features/siteTemplates/render'
import { loadSiteTemplate, prepareTemplateBlocks } from '@/features/siteTemplates/resolve'

type P = Record<string, unknown>

/**
 * The blocks of the chosen template, ready to draw, or null when there is nothing to draw: no id, the template
 * is off or missing, or it has no blocks. Parts inside parts and page content slots are dropped, so a part cannot
 * loop. Any read problem gives null, and the page still draws.
 */
async function partBlocks(templateId: unknown): Promise<{ id: string; blocks: unknown[] } | null> {
  try {
    const id = parseTemplatePartId(templateId)
    if (id === null) return null
    const template = await loadSiteTemplate(id)
    if (!template || template.enabled === false) return null
    const blocks = stripPartNesting(await prepareTemplateBlocks(template))
    return blocks.length > 0 ? { id, blocks } : null
  } catch {
    return null
  }
}

/** Server half of `template-part`: draws one site template (any kind) where the element sits. The template is chosen by id. */
export async function TemplatePartElement(props: P): Promise<React.ReactElement | null> {
  const part = await partBlocks(props.templateId)
  if (!part) return null
  return <div className="eg-template-part" data-template-part={part.id}>{renderTemplateBlocks(part.blocks)}</div>
}

export const TEMPLATE_PART_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'template-part': TemplatePartElement as never,
}
