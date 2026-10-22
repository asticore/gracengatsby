export type BlogSwitches = { authors: boolean; tags: boolean; authorArchives: boolean }

/** Blog feature switches from the blog settings global. Missing or non-false values mean ON so existing sites are unchanged. */
export function blogSwitches(settings: unknown): BlogSwitches {
  const s = settings && typeof settings === 'object' ? (settings as { showAuthors?: unknown; showTags?: unknown; authorArchives?: unknown }) : {}
  const authors = s.showAuthors !== false && s.showAuthors !== 0
  const archives = s.authorArchives !== false && s.authorArchives !== 0
  return { authors, tags: s.showTags !== false && s.showTags !== 0, authorArchives: authors && archives }
}

/** Loads the switches; any read failure leaves both ON. */
export async function loadBlogSwitches(): Promise<BlogSwitches> {
  try {
    const { getEngine } = await import('@/lib/engine')
    const engine = await getEngine()
    return blogSwitches(await engine.findGlobal({ slug: 'blog-settings' }))
  } catch {
    return blogSwitches(null)
  }
}
