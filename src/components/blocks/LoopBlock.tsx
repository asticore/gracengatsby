import React from 'react'

import { getEngine } from '@/lib/engine'
import { formatCurrency } from '@/lib/formatCurrency'
import { buildMergeContext, resolveTagsDeep } from '@/lib/mergeTags'
import type { SectionNode } from '@/lib/sectionTree'

import { StyledBlock } from './StyledBlock'

type LoopSource = 'products' | 'posts' | 'events' | 'faqs' | 'pages'

const SORTS: Record<string, string> = {
  newest: '-createdAt',
  oldest: 'createdAt',
  title: 'title',
}

/**
 * Renders a Page Template once per item in a collection - the Elementor "loop
 * grid" pattern.
 *
 * Each item's values are flattened into a merge context and substituted through
 * a deep copy of the template's blocks, so {{title}} / {{price}} / {{url}} etc.
 * inside the template resolve per item. The template itself is never mutated.
 */
export async function LoopBlock({
  heading,
  template,
  source,
  category,
  limit,
  columns,
  sortBy,
  renderNode,
}: {
  heading?: string | null
  template?: unknown
  source?: string | null
  category?: string | null
  limit?: number | null
  columns?: number | null
  sortBy?: string | null
  renderNode: (node: SectionNode, key: string) => React.ReactNode
}) {
  const collection: LoopSource = (source as LoopSource) || 'products'
  const engine = await getEngine()

  // The template may arrive as an id or an already-populated doc depending on
  // the depth the parent page was fetched at.
  const templateId = typeof template === 'object' && template !== null ? (template as { id?: number }).id : template
  if (!templateId) return null

  let templateBlocks: SectionNode[] = []
  try {
    const doc = await engine.findByID({ collection: 'page-templates', id: templateId as number, depth: 1 })
    templateBlocks = (doc?.blocks as SectionNode[] | undefined) || []
  } catch {
    // A deleted template should leave a gap, not break the whole page.
    return null
  }

  if (templateBlocks.length === 0) return null

  // 'pages' has no category field, so only apply the filter where it exists.
  const supportsCategory = collection === 'products' || collection === 'faqs' || collection === 'posts'
  const hasDraftStatus = collection === 'products' || collection === 'posts' || collection === 'pages'

  let items: Record<string, unknown>[] = []
  try {
    const result = await engine.find({
      collection,
      where: {
        and: [
          ...(hasDraftStatus ? [{ _status: { equals: 'published' } }] : []),
          ...(category && supportsCategory ? [{ category: { equals: category } }] : []),
        ],
      },
      sort: SORTS[sortBy || 'newest'] || '-createdAt',
      limit: limit || 6,
      depth: 1,
    })
    items = result.docs as unknown as Record<string, unknown>[]
  } catch {
    return null
  }

  if (items.length === 0) return null

  const columnCount = Math.min(Math.max(columns || 3, 1), 6)

  return (
    <section className="built-block built-block--loop">
      <div className="page-shell">
        {heading && (
          <div className="section-heading">
            <h2>{heading}</h2>
          </div>
        )}
        <div className="be-loop-grid" style={{ ['--loop-columns' as string]: String(columnCount) }}>
          {items.map((item) => {
            const context = buildMergeContext(item, collection, (cents) => formatCurrency(cents, 'AUD'))
            const resolved = resolveTagsDeep(templateBlocks, context)

            return (
              <div className="be-loop-item" key={String(item.id)}>
                {resolved.map((node, index) => (
                  <StyledBlock key={`${item.id}-${index}`} style={node.design} index={index}>
                    {renderNode(node, `${item.id}-${index}`)}
                  </StyledBlock>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
