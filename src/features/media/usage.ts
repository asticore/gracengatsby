/**
 * "Where is this picture used?" - scans the places a media document can be
 * referenced from and reports each one.
 *
 * Two kinds of check, because the engine can answer one and not the other:
 *   - Direct relationship fields (e.g. posts.featuredImage) are asked with a
 *     `where` clause, which is exact and cheap.
 *   - Everything nested - page blocks, SEO social images, product image lists,
 *     lesson files, global settings - is found by walking the stored document
 *     for a reference to the id under a key that looks like a picture. That is
 *     a bounded scan (at most SCAN_LIMIT documents per collection) and is
 *     reported as such when it hits the bound.
 */

/** Most documents read per collection by the nested-reference scan. Above this the rest are not read and the collection is reported as truncated. */
export const SCAN_LIMIT = 200
/** How long a finished report is reused for the same media id. Usage changes slowly and each scan reads many documents. */
export const REPORT_TTL_MS = 60_000
const MAX_HITS_PER_DOC = 50
const MAX_DEPTH = 12

/**
 * Keys that hold a picture or file in this app's content. A bare number equal
 * to the media id only counts under one of these, so `sortOrder: 7` never looks
 * like a reference to media 7.
 */
const MEDIA_KEY = /image|img|media|photo|logo|icon|favicon|thumb|poster|cover|background|hero|file|avatar|banner|gallery|picture/i

export type UsageTarget =
  | { kind: 'collection'; slug: string; relationFields?: string[] }
  | { kind: 'global'; slug: string }

/** Every place the library knows a media document can be referenced from. */
export const USAGE_TARGETS: UsageTarget[] = [
  { kind: 'collection', slug: 'posts', relationFields: ['featuredImage'] },
  { kind: 'collection', slug: 'events', relationFields: ['coverImage'] },
  { kind: 'collection', slug: 'courses', relationFields: ['coverImage'] },
  { kind: 'collection', slug: 'pages' },
  { kind: 'collection', slug: 'products' },
  { kind: 'collection', slug: 'lessons' },
  { kind: 'global', slug: 'site-settings' },
  { kind: 'global', slug: 'seo-settings' },
]

export type MediaReference = {
  type: 'collection' | 'global'
  collection: string
  id: string | number | null
  title: string
  field: string
  editUrl: string
}

export type UsageReport = {
  id: number
  count: number
  references: MediaReference[]
  /** Targets that could not be checked, so the list may be incomplete. */
  unchecked: string[]
  /** True when a collection had more documents than SCAN_LIMIT and the rest were not read. */
  truncated: string[]
}

/** The engine methods the scan uses. Injected so the scan can be tested with fakes. */
export type UsageEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>>; totalDocs?: number }>
  findGlobal: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

const isIdMatch = (value: unknown, id: number): boolean =>
  (typeof value === 'number' && value === id) || (typeof value === 'string' && value === String(id))

/**
 * Walks one stored document and returns the dotted paths at which the media id
 * is referenced - either as the bare id or as a populated `{ id }` object.
 */
export function findMediaPaths(value: unknown, id: number): string[] {
  const out: string[] = []

  const walk = (node: unknown, path: string[], key: string, depth: number): void => {
    if (out.length >= MAX_HITS_PER_DOC || depth > MAX_DEPTH) return

    if (Array.isArray(node)) {
      // Items inherit the array's own key, so `images: [7, 9]` matches on `images`.
      node.forEach((item, index) => walk(item, [...path, String(index)], key, depth + 1))
      return
    }

    if (node !== null && typeof node === 'object') {
      const record = node as Record<string, unknown>
      if (MEDIA_KEY.test(key) && isIdMatch(record.id, id)) {
        out.push(path.join('.'))
        return
      }
      for (const [childKey, child] of Object.entries(record)) {
        walk(child, [...path, childKey], childKey, depth + 1)
      }
      return
    }

    if (MEDIA_KEY.test(key) && isIdMatch(node, id)) out.push(path.join('.'))
  }

  walk(value, [], '', 0)
  return out
}

const titleOf = (doc: Record<string, unknown>, fallback: string): string => {
  for (const key of ['title', 'name', 'label', 'slug']) {
    const candidate = doc[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return fallback
}

export function editUrlFor(target: UsageTarget, id: string | number | null, adminRoute: string): string {
  if (target.kind === 'global') return `${adminRoute}/globals/${target.slug}`
  return `${adminRoute}/collections/${target.slug}/${String(id)}`
}

/** In-memory reports for the default targets, keyed by admin route and media id. Per process only; a cold start simply rescans. */
const reportCache = new Map<string, { at: number; report: UsageReport }>()

/**
 * Runs the full scan for one media id. Never throws for a single failed target:
 * that target is listed under `unchecked` and the rest still report. A report
 * for the default targets is reused for REPORT_TTL_MS.
 */
export async function scanMediaUsage(
  engine: UsageEngine,
  mediaId: number,
  adminRoute = '/admin',
  targets: UsageTarget[] = USAGE_TARGETS,
): Promise<UsageReport> {
  const cacheable = targets === USAGE_TARGETS
  const cacheKey = `${adminRoute}:${mediaId}`
  if (cacheable) {
    const cached = reportCache.get(cacheKey)
    if (cached && Date.now() - cached.at < REPORT_TTL_MS) return cached.report
  }
  const report = await runUsageScan(engine, mediaId, adminRoute, targets)
  if (cacheable) {
    if (reportCache.size > 500) {
      const now = Date.now()
      for (const [key, entry] of reportCache) if (now - entry.at >= REPORT_TTL_MS) reportCache.delete(key)
    }
    reportCache.set(cacheKey, { at: Date.now(), report })
  }
  return report
}

async function runUsageScan(
  engine: UsageEngine,
  mediaId: number,
  adminRoute: string,
  targets: UsageTarget[],
): Promise<UsageReport> {
  const references: MediaReference[] = []
  const seen = new Set<string>()
  const unchecked: string[] = []
  const truncated: string[] = []

  const add = (target: UsageTarget, doc: Record<string, unknown>, field: string): void => {
    const docId = target.kind === 'collection' ? (doc.id as string | number | undefined) ?? null : null
    const key = `${target.slug}:${String(docId)}:${field}`
    if (seen.has(key)) return
    seen.add(key)
    references.push({
      type: target.kind,
      collection: target.slug,
      id: docId,
      title: target.kind === 'global' ? target.slug : titleOf(doc, `#${String(docId)}`),
      field,
      editUrl: editUrlFor(target, docId, adminRoute),
    })
  }

  for (const target of targets) {
    try {
      if (target.kind === 'global') {
        const doc = await engine.findGlobal({ slug: target.slug, depth: 0, overrideAccess: true })
        if (doc) for (const path of findMediaPaths(doc, mediaId)) add(target, doc, path)
        continue
      }

      for (const field of target.relationFields ?? []) {
        const result = await engine.find({
          collection: target.slug,
          where: { [field]: { equals: mediaId } },
          limit: MAX_HITS_PER_DOC,
          depth: 0,
          overrideAccess: true,
        })
        for (const doc of result.docs) add(target, doc, field)
      }

      const scan = await engine.find({ collection: target.slug, limit: SCAN_LIMIT, page: 1, depth: 0, overrideAccess: true })
      if ((scan.totalDocs ?? scan.docs.length) > SCAN_LIMIT) truncated.push(target.slug)
      for (const doc of scan.docs) {
        for (const path of findMediaPaths(doc, mediaId)) add(target, doc, path)
      }
    } catch (error) {
      console.error(`Media usage check skipped ${target.slug}.`, error)
      unchecked.push(target.slug)
    }
  }

  return { id: mediaId, count: references.length, references, unchecked, truncated }
}
