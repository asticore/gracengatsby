import React from 'react'

import { getBlockContext } from '@/lib/blockContext'
import { cleanSnippet, embedCodeCategory, embedHeight, safePagePath, snippetHash } from '@/lib/embedCode'

import { EmbedCodeFrame } from './EmbedCodeFrame'

type P = Record<string, unknown>

/**
 * Server half of `embed-code`. The snippet is hashed here and NEVER rendered into the page: the HTML carries only
 * the hash and the page path (plus the consent placeholder from the client gate). Without a resolvable page path
 * (e.g. a template part outside a page) nothing is shown, because the frame route could not find the element.
 */
export async function EmbedCodeElement(props: P): Promise<React.ReactElement | null> {
  const snippet = cleanSnippet(props.snippet)
  const path = safePagePath(getBlockContext().path)
  if (!snippet || !path) return null
  const title = typeof props.title === 'string' && props.title.trim() ? props.title.trim().slice(0, 200) : 'Embedded content'
  return <EmbedCodeFrame hash={await snippetHash(snippet)} path={path} title={title} category={embedCodeCategory(props.consentCategory)} height={embedHeight(props.height)} />
}

export const EMBED_CODE_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'embed-code': EmbedCodeElement as never,
}
