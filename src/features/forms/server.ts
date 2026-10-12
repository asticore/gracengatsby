import type { FormDoc } from './types'

import { isPublished } from './layout'
import { FORMS_SLUG } from './slugs'

/**
 * Looking a form up from the outside: by numeric id (the original address) or
 * by its public embed key. Server-only helpers shared by the submit route, the
 * embed page and the editor preview.
 *
 * The engine is passed in rather than imported: see the note in settings.ts on
 * why nothing in this feature may reach for `@/lib/engine`.
 */

export type LookupEngine = {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
}

const EMBED_KEY = /^[a-z0-9]{8,40}$/

/** A positive integer id, or null. */
export function parseFormId(value: string | number): number | null {
  const text = String(value)
  return /^\d{1,12}$/.test(text) && Number(text) > 0 ? Number(text) : null
}

export const isEmbedKey = (value: string): boolean => EMBED_KEY.test(value)

/**
 * The form, whichever way it was addressed. Never throws.
 *
 * Reads with the local API's default `overrideAccess` so a draft is findable;
 * callers decide whether a draft may be shown (`isPublished`).
 */
export async function loadForm(engine: LookupEngine, idOrKey: string | number): Promise<FormDoc | null> {
  const id = parseFormId(idOrKey)
  try {
    if (id !== null) {
      return ((await engine.findByID({ collection: FORMS_SLUG, id, depth: 0 })) as FormDoc | null) || null
    }
    const key = String(idOrKey)
    if (!isEmbedKey(key)) return null
    const found = await engine.find({ collection: FORMS_SLUG, where: { embedKey: { equals: key } }, limit: 1, depth: 0 })
    return (found.docs[0] as FormDoc | undefined) || null
  } catch {
    return null
  }
}

/** A form visitors may see: it exists and is not a draft. */
export async function loadPublishedForm(engine: LookupEngine, idOrKey: string | number): Promise<FormDoc | null> {
  const form = await loadForm(engine, idOrKey)
  return form && isPublished(form) ? form : null
}
