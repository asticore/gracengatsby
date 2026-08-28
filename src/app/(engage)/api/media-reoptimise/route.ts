import { NextResponse } from 'next/server'

import type { MediaRecord } from '@/features/media/bulk'

import { getEngine } from '@/lib/engine'
import { reoptimiseBatch } from '@/features/media/bulk'
import { getMediaConfig } from '@/features/media/settings'
import { hasInternalRouteKey } from '@/utilities/internalRouteGuard'

// Bulk re-optimise for the existing media library.
//
// Walks eg_media one batch at a time - the batch size comes from Media
// Settings, and the response hands back the next page number rather than
// looping, because a Worker has a hard wall-clock and subrequest budget and a
// large library will not fit inside one invocation. The caller keeps POSTing
// with the returned nextPage until it comes back null.
//
// What a run actually does is explained in features/media/bulk.ts: nothing is
// re-encoded (no `sharp` on Workers) and nothing is written back to R2 or D1.
// It recomputes each record's derived delivery URLs from the current settings
// and pre-warms the widest variant at the edge.
//
// Guard: the same header/value pair as internal-migrate and internal-seed,
// deliberately rather than a new scheme. Like those, this is read-only against
// content - it creates and modifies nothing - so the header is a guard against
// accidental or crawler hits, not a security boundary.

export async function POST(request: Request): Promise<Response> {
  if (!hasInternalRouteKey(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const requested = Number(url.searchParams.get('page') ?? '1')
  const page = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1

  const config = await getMediaConfig()

  // Not an error: it is the correct answer when the feature is off or the
  // provider is 'none'. Every image is already being served as uploaded, so
  // there is no derived variant to refresh.
  if (!config.enabled) {
    return NextResponse.json({
      ok: true,
      skipped: 'Media optimisation is off - images are served exactly as uploaded.',
      provider: config.provider,
    })
  }

  const engine = await getEngine()

  const report = await reoptimiseBatch(
    config,
    {
      findMedia: async ({ limit, page: current }) => {
        const result = await engine.find({
          collection: 'media',
          limit,
          page: current,
          depth: 0,
          pagination: true,
          // Stable ordering, or a record can be seen twice across batches while
          // another is never seen at all.
          sort: 'id',
        })

        return {
          docs: result.docs as unknown as MediaRecord[],
          totalDocs: result.totalDocs,
          totalPages: result.totalPages,
          hasNextPage: Boolean(result.hasNextPage),
        }
      },
      // HEAD rather than GET: the edge still has to fetch and transform the
      // original to answer, so the variant lands in cache, but no image bytes
      // come back to the Worker.
      fetchUrl: async (target) => {
        const response = await fetch(target, { method: 'HEAD' })
        return { ok: response.ok, status: response.status }
      },
      origin: url.origin,
    },
    page,
  )

  return NextResponse.json({ ok: report.failed === 0, provider: config.provider, ...report })
}
