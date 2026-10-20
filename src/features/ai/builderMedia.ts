/**
 * Turns the model's picture placeholders into media library ids.
 *
 * The model may write {"mediaQuery":"...","alt":"..."} where a picture field goes. Each one is
 * matched against the site's own media library (file name and alt text). Nothing is fetched from
 * the web and no id from the model is trusted. A placeholder with no good match is removed from the
 * tree and reported in `unresolved`, with its alt text, so the admin can choose a picture.
 */

import type { SectionNode } from '@/lib/sectionTree'

import { isMediaPlaceholder } from './builderValidate'

export type MediaCandidate = { id: number; filename?: string | null; alt?: string | null; mimeType?: string | null }

export type MediaFinder = (tokens: string[]) => Promise<MediaCandidate[]>

export type UnresolvedMedia = { elementType: string; field: string; query: string; alt: string }

export const MEDIA_MAX_LOOKUPS = 12

const STOP_WORDS = new Set(['the', 'and', 'with', 'for', 'photo', 'image', 'picture', 'pic', 'shot', 'of', 'a', 'an', 'in', 'on'])

/** Lower-case words of 3 or more letters or digits from a search phrase, without filler words. Up to 5. */
export function queryTokens(query: string): string[] {
  const words = query.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  return Array.from(new Set(words)).slice(0, 5)
}

/** The best candidate for the tokens, or null when fewer than half of them match. Pictures only. */
export function bestMediaMatch(tokens: string[], candidates: MediaCandidate[]): MediaCandidate | null {
  if (tokens.length === 0) return null
  const need = Math.max(1, Math.ceil(tokens.length / 2))
  let best: { candidate: MediaCandidate; score: number } | null = null
  for (const candidate of candidates) {
    if (typeof candidate.id !== 'number') continue
    if (candidate.mimeType && !candidate.mimeType.startsWith('image/')) continue
    const haystack = `${candidate.filename ?? ''} ${candidate.alt ?? ''}`.toLowerCase()
    const score = tokens.filter((token) => haystack.includes(token)).length
    if (score >= need && (!best || score > best.score)) best = { candidate, score }
  }
  return best ? best.candidate : null
}

/**
 * Replaces every placeholder in the sections (in place) with a library id, or removes it.
 * Never throws: a failing lookup counts as no match.
 */
export async function resolveMediaPlaceholders(
  sections: SectionNode[],
  find: MediaFinder,
): Promise<{ resolved: number; unresolved: UnresolvedMedia[] }> {
  const unresolved: UnresolvedMedia[] = []
  const cache = new Map<string, number | null>()
  let resolved = 0
  let lookups = 0

  const lookup = async (query: string): Promise<number | null> => {
    const tokens = queryTokens(query)
    const key = tokens.join(' ')
    if (cache.has(key)) return cache.get(key) ?? null
    if (tokens.length === 0 || lookups >= MEDIA_MAX_LOOKUPS) return null
    lookups += 1
    let id: number | null = null
    try {
      id = bestMediaMatch(tokens, await find(tokens))?.id ?? null
    } catch {
      id = null
    }
    cache.set(key, id)
    return id
  }

  const walkValue = async (parent: Record<string, unknown> | unknown[], key: string | number, elementType: string): Promise<void> => {
    const holder = parent as Record<string | number, unknown>
    const value = holder[key]
    if (isMediaPlaceholder(value)) {
      const id = await lookup(value.mediaQuery)
      if (id !== null) {
        holder[key] = id
        resolved += 1
      } else {
        delete holder[key]
        unresolved.push({ elementType, field: String(key), query: value.mediaQuery, alt: typeof value.alt === 'string' ? value.alt : '' })
      }
      return
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) await walkValue(value, i, elementType)
    } else if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) await walkValue(value as Record<string, unknown>, k, elementType)
    }
  }

  const walkNodes = async (nodes: SectionNode[]): Promise<void> => {
    for (const node of nodes) {
      if (node.blockType === 'element') {
        if (node.props && typeof node.props === 'object') {
          for (const k of Object.keys(node.props)) await walkValue(node.props as Record<string, unknown>, k, String(node.elementType ?? ''))
        }
      }
      if (Array.isArray(node.columns)) for (const column of node.columns) await walkNodes((column.blocks ?? []) as SectionNode[])
    }
  }

  await walkNodes(sections)
  return { resolved, unresolved }
}

/** Builds a finder over the engine's media collection: one query on file name or alt text, images only. */
export function engineMediaFinder(engine: {
  find: (args: Record<string, unknown>) => Promise<{ docs?: unknown[] }>
}): MediaFinder {
  return async (tokens) => {
    const clauses = tokens.flatMap((token) => [{ filename: { contains: token } }, { alt: { contains: token } }])
    const result = await engine.find({
      collection: 'media',
      where: { or: clauses },
      limit: 40,
      depth: 0,
      overrideAccess: true,
    })
    return (result.docs ?? []) as MediaCandidate[]
  }
}
