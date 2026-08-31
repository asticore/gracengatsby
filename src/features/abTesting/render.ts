import type { AbContext, ActiveTest, VariantSpec } from './types'

/**
 * Applying the assigned variant to the content about to be rendered.
 *
 * The rule this file exists to enforce: when anything is missing, unresolved or
 * switched off, the ORIGINAL blocks come back. A test that cannot find its
 * replacement content must show the page the site already has, not an empty
 * page - a broken test should cost a measurement, never a visitor.
 */

export type BlockLike = { id?: string | null; [key: string]: unknown }

type Engine = {
  findByID(args: {
    collection: string
    id: string
    depth?: number
    overrideAccess?: boolean
  }): Promise<unknown>
}

const variantOf = (test: ActiveTest, context: AbContext): VariantSpec | null => {
  const key = context.assignments[test.id]
  if (!key) return null
  return test.variants.find((variant) => variant.key === key) ?? null
}

const blocksOf = async (engine: Engine, collection: string, id: string): Promise<BlockLike[] | null> => {
  const doc = (await engine
    .findByID({ collection, id, depth: 2, overrideAccess: true })
    .catch((): null => null)) as { blocks?: BlockLike[] } | null
  return Array.isArray(doc?.blocks) ? doc.blocks : null
}

export type VariantApplication = {
  blocks: BlockLike[]
  /** testId -> variant key actually rendered. What the tracker reports against. */
  applied: Record<string, string>
}

/**
 * Returns the blocks to render for this page, given the visitor's assignments.
 *
 * `pageId` is compared against the test's own target rather than trusted from
 * the path, so a page reachable at two URLs cannot be counted as two tests.
 */
export const applyVariants = async (
  engine: Engine,
  context: AbContext,
  pageId: string,
  original: BlockLike[],
): Promise<VariantApplication> => {
  if (!context.enabled || context.tests.length === 0) return { blocks: original, applied: {} }

  let blocks = original
  const applied: Record<string, string> = {}

  for (const test of context.tests) {
    if (test.pageId !== String(pageId)) continue

    const variant = variantOf(test, context)
    if (!variant) continue

    // The control is the original content by definition, so it is recorded as
    // rendered without anything being swapped.
    if (variant.isControl) {
      applied[test.id] = variant.key
      continue
    }

    if (test.scope === 'page' && variant.pageId) {
      const replacement = await blocksOf(engine, 'pages', variant.pageId)
      if (replacement) {
        blocks = replacement
        applied[test.id] = variant.key
      }
      continue
    }

    if (test.scope === 'block' && variant.templateId && test.blockId) {
      const replacement = await blocksOf(engine, 'page-templates', variant.templateId)
      if (!replacement) continue

      const index = blocks.findIndex((block) => String(block?.id ?? '') === test.blockId)
      if (index === -1) continue

      blocks = [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)]
      applied[test.id] = variant.key
    }
  }

  return { blocks, applied }
}
