import React from 'react'

import { prepareTemplateBlocks, resolveSiteTemplate } from './resolve'
import { renderTemplateBlocks } from './render'
import { parseColumns, type SectionNode } from '@/lib/sectionTree'
import type { SiteTemplateKind } from './types'

/** The request path without any query string. Reads x-pathname first, then next-url, then ''. */
export const requestPathOf = (reader: { get(name: string): string | null }): string => {
  const raw = reader.get('x-pathname') || reader.get('next-url') || ''
  const cut = raw.search(/[?#]/)
  return cut === -1 ? raw : raw.slice(0, cut)
}

const isSlot = (node: SectionNode): boolean => node.blockType === 'element' && node.elementType === 'content-slot'

/**
 * Header and footer are drawn in the layout, outside the page's render, so there is no page content to
 * place: any Template content element is removed (top level and inside sections).
 */
export function stripContentSlots(blocks: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const node = raw as SectionNode
    if (isSlot(node)) continue
    if (node.blockType === 'section') {
      out.push({ ...node, columns: stripNested(parseColumns(node.columns)) })
    } else out.push(node)
  }
  return out
}

const stripNested = (columns: ReturnType<typeof parseColumns>): ReturnType<typeof parseColumns> =>
  columns.map((column) => ({
    ...column,
    blocks: (column.blocks || [])
      .filter((n) => !isSlot(n))
      .map((n) => (n.blockType === 'section' ? { ...n, columns: stripNested(parseColumns(n.columns)) } : n)),
  }))

const render = async (kind: SiteTemplateKind, path: string): Promise<React.ReactNode | null> => {
  try {
    const template = await resolveSiteTemplate(kind, { path })
    if (!template) return null
    const blocks = stripContentSlots(await prepareTemplateBlocks(template))
    return blocks.length > 0 ? renderTemplateBlocks(blocks) : null
  } catch {
    return null
  }
}

/**
 * The site header and footer from templates, or null for each when none matches (the layout then draws its
 * own). Both share one query through loadSiteTemplates.
 */
export async function renderChromeTemplates(path: string): Promise<{ header: React.ReactNode | null; footer: React.ReactNode | null }> {
  const [header, footer] = await Promise.all([render('header', path), render('footer', path)])
  return { header, footer }
}
