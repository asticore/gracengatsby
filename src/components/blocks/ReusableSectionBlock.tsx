import React from 'react'

import { getEngine } from '@/lib/engine'
import { applyTranslations, currentRequestLocale } from '@/features/multilingual/applyTranslations'
import { canExpandReusableSection, reusableSectionIdOf, tagReusableSections } from '@/lib/reusableSection'
import type { SectionNode } from '@/lib/sectionTree'

import { StyledBlock } from './StyledBlock'

/**
 * Renders a reusable section: the blocks of one `reusable-sections` document, live. Editing that
 * document changes every page that points at it.
 *
 * `chain` lists the sections already open above this one. A section already in the chain, or a
 * chain at the depth limit, renders nothing, so a section that contains itself cannot loop. A
 * missing or deleted section also renders nothing.
 */
export async function ReusableSectionBlock({
  section,
  chain = [],
  renderNode,
}: {
  section?: unknown
  chain?: number[]
  renderNode: (node: SectionNode, key: string) => React.ReactNode
}) {
  const sectionId = reusableSectionIdOf(section)
  if (!canExpandReusableSection(sectionId, chain)) return null

  const engine = await getEngine()
  let blocks: SectionNode[] = []
  try {
    const found = await engine.findByID({ collection: 'reusable-sections' as never, id: sectionId, depth: 1, overrideAccess: true })
    // Translated text of this section, in the page's language. Unchanged when there is none.
    const doc = found ? await applyTranslations(found, 'reusable-sections', await currentRequestLocale()) : found
    blocks = (doc?.blocks as SectionNode[] | undefined) || []
  } catch {
    // A deleted section should leave a gap, not break the whole page.
    return null
  }
  if (blocks.length === 0) return null

  const nested = tagReusableSections(blocks, [...chain, sectionId])
  return (
    <>
      {nested.map((node, index) => {
        const key = node._id || `reusable-${sectionId}-${index}`
        return (
          <StyledBlock key={key} style={node.design} index={index}>
            {renderNode(node, key)}
          </StyledBlock>
        )
      })}
    </>
  )
}
