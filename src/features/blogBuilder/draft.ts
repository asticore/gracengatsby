/**
 * Saves the reviewed post as a DRAFT in the Blog (posts) collection. Never publishes:
 * the engine is called with draft: true, and the admin publishes from the edit screen.
 */

import { postContent } from './content'
import { slugify } from './parse'
import type { BlogMeta, BlogOutlineItem } from './request'

/** The slice of the engine this needs. Matches the engine's find and create. */
export type DraftEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
  create: (args: Record<string, unknown>) => Promise<{ id: number | string }>
}

/** `slug`, or `slug-2`, `slug-3`... up to 20 tries, so a new draft never clashes with an existing post. */
export async function uniqueSlug(engine: DraftEngine, base: string): Promise<string> {
  const root = base || `post-${Date.now().toString(36)}`
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? root : `${root.slice(0, 70)}-${n}`
    const { docs } = await engine.find({
      collection: 'posts',
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    if (docs.length === 0) return candidate
  }
  return `${root.slice(0, 60)}-${Date.now().toString(36)}`
}

export type DraftInput = {
  title: string
  outline: BlogOutlineItem[]
  sections: string[]
  meta: BlogMeta
}

/** The posts data for a new draft. Pure, so the shape is easy to assert. */
export function draftData(input: DraftInput, slug: string): Record<string, unknown> {
  return {
    title: input.title,
    slug,
    excerpt: input.meta.metaDescription,
    content: postContent(input.outline, input.sections),
    categories: input.meta.category ? [{ name: input.meta.category }] : [],
    tags: input.meta.tags.map((name) => ({ name })),
    seo: { metaTitle: input.meta.metaTitle, metaDescription: input.meta.metaDescription },
  }
}

/** Creates the draft as the signed-in user, so the collection's own access rules apply. */
export async function createBlogDraft(
  engine: DraftEngine,
  user: unknown,
  input: DraftInput,
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(engine, slugify(input.meta.slug || input.title))
  const doc = await engine.create({
    collection: 'posts',
    data: draftData(input, slug),
    draft: true,
    user,
  })
  return { id: String(doc.id), slug }
}
