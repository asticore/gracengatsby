import type { MediaConfig, MediaLike } from './types'

import { buildImageUrl, candidateWidths } from './url'

/**
 * Bulk re-optimise.
 *
 * WHAT "RE-OPTIMISE" MEANS ON THIS STACK
 * --------------------------------------
 * ShortPixel and Smush re-optimise by reading each original, re-encoding it and
 * writing new files back. Neither half of that is possible here: `sharp` does
 * not run on Workers, so nothing can decode an image, and the originals in R2
 * are meant to stay untouched anyway.
 *
 * Because the delivery URL is a pure function of (record, settings), there is
 * no stored derived data that can go stale - change the quality setting and
 * every URL on the next render already carries the new value. What DOES go
 * stale is Cloudflare's cache of the previously transformed variants, and what
 * is genuinely unknown is whether the new settings actually produce a working
 * transform for every record in the library.
 *
 * So a run here does two useful things per record: it recomputes the derived
 * URL set, and it fetches the largest variant so the edge transforms and caches
 * it before a visitor asks for it. That turns the first hit on a re-optimised
 * image from a cold transform into a cache hit, and it surfaces records the new
 * settings cannot serve.
 */

export type MediaRecord = MediaLike & { id: number | string }

export type BulkItemReport = {
  id: number | string
  filename: string | null
  /** How many srcset candidates the current settings produce for this record. */
  variants: number
  url: string
  /** 'warmed' - the edge produced it; 'skipped' - not transformable or no absolute URL; 'failed' - see status. */
  outcome: 'warmed' | 'skipped' | 'failed'
  status?: number
}

export type BulkBatchReport = {
  page: number
  batchSize: number
  processed: number
  warmed: number
  skipped: number
  failed: number
  totalDocs: number
  totalPages: number
  /** Null once the library has been walked to the end. */
  nextPage: number | null
  items: BulkItemReport[]
}

/**
 * A Worker is capped on outbound subrequests per invocation, and the cap is low
 * enough that warming every srcset width of every record in a batch would blow
 * through it and fail the whole run. Only the widest variant is fetched - it is
 * the expensive one, and the narrower widths are cheap once the origin fetch is
 * cached.
 */
const MAX_WARM_REQUESTS = 40

/** Relative URLs need an origin before they can be fetched from inside the Worker. */
const absolute = (url: string, origin: string): string | null => {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${origin}${url}`
  return null
}

export type BulkDeps = {
  /** Reads one page of the media collection. Injected so this stays testable. */
  findMedia: (args: { limit: number; page: number }) => Promise<{
    docs: MediaRecord[]
    totalDocs: number
    totalPages: number
    hasNextPage: boolean
  }>
  fetchUrl: (url: string) => Promise<{ ok: boolean; status: number }>
  origin: string
}

export async function reoptimiseBatch(
  config: MediaConfig,
  deps: BulkDeps,
  page: number,
): Promise<BulkBatchReport> {
  const batchSize = config.batchSize
  const result = await deps.findMedia({ limit: batchSize, page })

  const items: BulkItemReport[] = []
  let warmRequests = 0

  for (const doc of result.docs) {
    const widths = candidateWidths(doc, config)
    // The width actually worth warming: the largest the settings will ever ask
    // for on this record.
    const widest = widths.length > 0 ? widths[widths.length - 1] : undefined
    const url = buildImageUrl(doc, config, widest ? { width: widest } : {})

    const report: BulkItemReport = {
      id: doc.id,
      filename: doc.filename ?? null,
      variants: widths.length,
      url,
      outcome: 'skipped',
    }

    const target = url && config.enabled ? absolute(url, deps.origin) : null

    // An untransformed URL means the record fell back to plain R2 - there is
    // nothing at the edge to warm, and fetching it would only burn a subrequest.
    const transformed = Boolean(target) && url !== doc.url

    if (transformed && warmRequests < MAX_WARM_REQUESTS) {
      warmRequests += 1
      try {
        const response = await deps.fetchUrl(target as string)
        report.status = response.status
        report.outcome = response.ok ? 'warmed' : 'failed'
      } catch {
        report.outcome = 'failed'
      }
    }

    items.push(report)
  }

  return {
    page,
    batchSize,
    processed: items.length,
    warmed: items.filter((item) => item.outcome === 'warmed').length,
    skipped: items.filter((item) => item.outcome === 'skipped').length,
    failed: items.filter((item) => item.outcome === 'failed').length,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    nextPage: result.hasNextPage ? page + 1 : null,
    items,
  }
}
