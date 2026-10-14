/**
 * Pure helpers for reusable sections (see src/blocks/ReusableSection.ts and
 * src/components/blocks/ReusableSectionBlock.tsx).
 *
 * A reusable section block points at one `reusable-sections` document and
 * renders its blocks live. A section may contain another reusable section, so
 * the renderer needs a guard against loops: each expansion records the chain of
 * sections it came from, and a section already in that chain, or a chain that
 * has reached the depth limit, renders nothing.
 */

import type { SectionColumn, SectionNode } from './sectionTree'

/** How many reusable sections may be nested inside one another. */
export const REUSABLE_SECTION_MAX_DEPTH = 3

/** Key the tagging step writes onto nested reusable section nodes. */
export const REUSABLE_CHAIN_KEY = '_chain'

/** Reads a section id from a relationship value: a bare id, a numeric string, or a populated doc. */
export function reusableSectionIdOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return parsed > 0 ? parsed : null
  }
  if (value && typeof value === 'object' && 'id' in value) return reusableSectionIdOf((value as { id?: unknown }).id)
  return null
}

/**
 * True when the section with `sectionId` may be expanded given the sections
 * already open above it. False for a missing id, a section already in the
 * chain (a loop, including a section that contains itself), or a chain at the
 * depth limit.
 */
export function canExpandReusableSection(sectionId: number | null, chain: readonly number[]): sectionId is number {
  if (sectionId === null) return false
  if (chain.length >= REUSABLE_SECTION_MAX_DEPTH) return false
  return !chain.includes(sectionId)
}

/** Reads the chain recorded on a node by tagReusableSections, ignoring anything malformed. */
export function reusableChainOf(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0)
}

/**
 * Returns a copy of `blocks` where every reusable section node, at any depth
 * (including inside Section columns), carries `chain` under REUSABLE_CHAIN_KEY.
 * The input is not changed.
 */
export function tagReusableSections(blocks: SectionNode[], chain: readonly number[]): SectionNode[] {
  return blocks.map((node) => tagNode(node, chain))
}

function tagNode(node: SectionNode, chain: readonly number[]): SectionNode {
  if (node.blockType === 'reusableSection') return { ...node, [REUSABLE_CHAIN_KEY]: [...chain] }
  if (node.blockType === 'section' && Array.isArray(node.columns)) {
    return { ...node, columns: node.columns.map((column) => tagColumn(column, chain)) }
  }
  return node
}

function tagColumn(column: SectionColumn, chain: readonly number[]): SectionColumn {
  if (!column || typeof column !== 'object' || !Array.isArray(column.blocks)) return column
  return { ...column, blocks: column.blocks.map((node) => tagNode(node, chain)) }
}
