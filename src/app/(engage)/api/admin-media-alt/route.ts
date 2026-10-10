import { NextResponse } from 'next/server'

import { AiError } from '@/features/ai/client'
import { generateAltText } from '@/features/ai/altText'
import { AI_PROVIDERS, type AiProvider } from '@/features/ai/models'
import { aiKeyAvailability, readAiKey } from '@/features/ai/keys'
import { authorizeMedia } from '@/features/media/access'
import { readMediaObject } from '@/localapi/storage'
import { cleanAltText } from '@/features/media/library'
import { loadMedia, mediaUpdater, parseIdList, readJsonBody, type MediaEngine } from '@/features/media/store'

/** Most pictures one request may describe. Each one is a paid model call. */
const MAX_PER_REQUEST = 25

/** Formats the providers can read. SVG and GIF are left alone. */
const READABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

type ItemResult = { id: number; status: 'updated' | 'skipped' | 'failed'; alt?: string; reason?: string }

/** GET - which providers have a key, so the UI can pick a default. Presence only. */
export async function GET(): Promise<Response> {
  const auth = await authorizeMedia('update')
  if (!auth.context) return auth.response
  return NextResponse.json({ providers: await aiKeyAvailability() })
}

/**
 * POST /api/admin-media-alt  { ids, provider, overwrite?, confirmOverwrite? }
 *
 * Writes alt text for each picture with a vision model. By default only pictures
 * with empty alt text are filled in. Replacing existing alt text needs both
 * overwrite and confirmOverwrite set to true. Each picture succeeds or fails on
 * its own; one failure does not stop the rest.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeMedia('update')
  if (!auth.context) return auth.response

  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Send JSON with ids and a provider.' }, { status: 400 })

  const ids = parseIdList(body.ids, MAX_PER_REQUEST)
  if (!ids) return NextResponse.json({ error: `Choose between 1 and ${MAX_PER_REQUEST} pictures.` }, { status: 400 })

  const provider = body.provider as AiProvider
  if (!AI_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Choose Claude or OpenAI.' }, { status: 400 })

  const overwrite = body.overwrite === true
  if (overwrite && body.confirmOverwrite !== true) {
    return NextResponse.json(
      { error: 'Replacing existing alt text needs confirmOverwrite set to true. Leave overwrite off to fill empty alt text only.' },
      { status: 400 },
    )
  }

  const apiKey = await readAiKey(provider).catch((): null => null)
  const name = provider === 'claude' ? 'Claude' : 'OpenAI'
  if (!apiKey) return NextResponse.json({ error: `No ${name} API key is set in Integrations.` }, { status: 400 })

  const engine = auth.context.engine as unknown as MediaEngine
  const update = mediaUpdater(engine)

  const describe = async (id: number): Promise<ItemResult> => {
    const doc = await loadMedia(engine, id)
    if (!doc) return { id, status: 'failed', reason: 'This picture no longer exists.' }
    if (!overwrite && typeof doc.alt === 'string' && doc.alt.trim()) {
      return { id, status: 'skipped', reason: 'Already has alt text.' }
    }
    if (!doc.filename || !doc.mimeType || !READABLE.has(doc.mimeType)) {
      return { id, status: 'skipped', reason: 'Alt text can only be written for JPEG, PNG and WebP pictures.' }
    }
    try {
      const stored = await readMediaObject(doc.filename)
      if (!stored) return { id, status: 'failed', reason: 'The file is missing from storage.' }
      const alt = cleanAltText(await generateAltText(provider, { data: stored.data, mimeType: doc.mimeType }, apiKey))
      if (!alt) return { id, status: 'failed', reason: 'The model returned no usable alt text.' }
      await update(id, { alt })
      return { id, status: 'updated', alt }
    } catch (error) {
      const reason = error instanceof AiError ? error.message : 'Alt text could not be written for this picture.'
      return { id, status: 'failed', reason }
    }
  }

  // Four at a time: quick enough for a batch, gentle on the provider's rate limit.
  const results: ItemResult[] = []
  for (let i = 0; i < ids.length; i += 4) {
    results.push(...(await Promise.all(ids.slice(i, i + 4).map(describe))))
  }

  return NextResponse.json({ ok: results.every((item) => item.status !== 'failed'), provider, results })
}