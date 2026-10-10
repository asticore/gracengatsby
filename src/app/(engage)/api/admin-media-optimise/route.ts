import { NextResponse } from 'next/server'

import { authorizeMedia } from '@/features/media/access'
import { IMAGES_UNAVAILABLE_MESSAGE } from '@/features/media/optimise'
import { resolveImagesBinding } from '@/features/media/imagesBinding'
import { optimiseStoredMedia } from '@/features/media/library'
import { loadMedia, mediaUpdater, parseIdList, readJsonBody, readOptimiseSettings, type MediaEngine } from '@/features/media/store'

/** Hard ceiling on pictures per request, whatever Media Settings says. */
const MAX_PER_REQUEST = 25

/**
 * POST /api/admin-media-optimise  { ids: number[], force?: boolean }
 *
 * Re-encodes existing pictures in place under the same filenames, so every
 * link keeps working. A request takes at most min(bulk.batchSize, 25) pictures.
 * Pictures that are already optimised are skipped unless force is true.
 * Returns one result per picture, with its status and before and after size.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeMedia('update')
  if (!auth.context) return auth.response

  const engine = auth.context.engine as unknown as MediaEngine
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Send JSON with an ids list.' }, { status: 400 })

  const settings = await readOptimiseSettings(engine)
  const cap = Math.min(settings.batchSize, MAX_PER_REQUEST)
  const ids = parseIdList(body.ids, 100)
  if (!ids) return NextResponse.json({ error: 'Choose at least one picture.' }, { status: 400 })
  if (!settings.enabled) {
    return NextResponse.json({ error: 'Turn on optimisation in Media settings first.' }, { status: 409 })
  }
  if (ids.length > cap) {
    return NextResponse.json(
      { error: `Optimise at most ${cap} pictures at a time. The batch size is set in Media settings.`, cap },
      { status: 400 },
    )
  }
  const force = body.force === true

  const binding = await resolveImagesBinding()
  if (!binding) return NextResponse.json({ error: IMAGES_UNAVAILABLE_MESSAGE, code: 'images-unavailable' }, { status: 422 })

  const update = mediaUpdater(engine)
  const results = []
  for (const id of ids) {
    const doc = await loadMedia(engine, id)
    if (!doc) {
      results.push({ id, status: 'failed', reason: 'This picture no longer exists.', before: null, after: null })
      continue
    }
    results.push(await optimiseStoredMedia(doc, settings, binding, update, undefined, { force }))
  }

  return NextResponse.json({ ok: results.every((result) => result.status !== 'failed'), results })
}