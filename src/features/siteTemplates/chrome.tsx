import React from 'react'

import { prepareTemplateBlocks, resolveSiteTemplate } from './resolve'
import { renderTemplateBlocks } from './render'
import { stripContentSlots } from './nodes'
import type { SiteTemplateKind, TemplateContext } from './types'

export { stripContentSlots }

/** The request path without any query string. Reads x-pathname first, then next-url, then ''. */
export const requestPathOf = (reader: { get(name: string): string | null }): string => {
  const raw = reader.get('x-pathname') || reader.get('next-url') || ''
  const cut = raw.search(/[?#]/)
  return cut === -1 ? raw : raw.slice(0, cut)
}

/** Where a request is, beyond its path: the host it arrived on and its language. Both feed the conditions. */
export type ChromeScope = { domain?: string | null; language?: string | null }

const render = async (kind: SiteTemplateKind, path: string, scope: ChromeScope): Promise<React.ReactNode | null> => {
  try {
    const template = await resolveSiteTemplate(kind, contextOf(path, scope))
    if (!template) return null
    const blocks = stripContentSlots(await prepareTemplateBlocks(template))
    return blocks.length > 0 ? renderTemplateBlocks(blocks) : null
  } catch {
    return null
  }
}

const contextOf = (path: string, scope: ChromeScope): TemplateContext => ({
  path,
  ...(scope.domain !== undefined ? { domain: scope.domain } : {}),
  ...(scope.language !== undefined ? { language: scope.language } : {}),
})

/**
 * The site header and footer from templates, or null for each when none matches (the layout then draws its
 * own). Both share one query through loadSiteTemplates.
 */
export async function renderChromeTemplates(path: string, scope: ChromeScope = {}): Promise<{ header: React.ReactNode | null; footer: React.ReactNode | null }> {
  const [header, footer] = await Promise.all([render('header', path, scope), render('footer', path, scope)])
  return { header, footer }
}

/**
 * The left and right sidebars that apply to this request, or null for each. The layout places them beside the
 * page's main content (see SidebarLayout).
 */
export async function renderSidebarTemplates(path: string, scope: ChromeScope = {}): Promise<{ left: React.ReactNode | null; right: React.ReactNode | null }> {
  const [left, right] = await Promise.all([render('sidebar-left', path, scope), render('sidebar-right', path, scope)])
  return { left, right }
}
