import { NextResponse } from 'next/server'

import { authorizeMedia } from '@/features/media/access'
import {
  importAltText,
  importAllowList,
  importFileName,
  fetchImportBytes,
  resolveImportUrl,
  safeHttpsUrl,
  STOCK_PROVIDERS,
  StockError,
  type StockProvider,
} from '@/features/media/stock'
import { readJsonBody, readStockKeys, type MediaEngine } from '@/features/media/store'
import type { UploadFile } from '@/localapi/uploads'

const PROVIDER_LABELS: Record<StockProvider, string> = {
  openverse: 'Openverse',
  unsplash: 'Unsplash',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
}

/** Caps and short strings from the browser. The server re-derives the picture address itself. */
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/**
 * POST /api/admin-media-stock-import
 *   { provider, id, full?, downloadLocation?, title?, author?, authorUrl?, license?, licenseUrl?, sourceUrl? }
 *
 * Downloads the chosen picture on the server, stores it as a media document
 * with its credit, licence and source, and returns the new document.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeMedia('create')
  if (!auth.context) return auth.response

  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Send JSON with the picture to import.' }, { status: 400 })

  const provider = body.provider as StockProvider
  if (!STOCK_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Choose a photo library.' }, { status: 400 })
  const id = text(body.id, 80)
  if (!id) return NextResponse.json({ error: 'That picture id is not valid.' }, { status: 400 })

  const engine = auth.context.engine as unknown as MediaEngine
  const title = text(body.title, 300)
  const author = text(body.author, 120)
  const label = PROVIDER_LABELS[provider]

  try {
    const keys = await readStockKeys(engine)
    const address = await resolveImportUrl(
      { provider, id, full: text(body.full, 2048), downloadLocation: text(body.downloadLocation, 2048) },
      keys,
    )
    const { data, mimeType } = await fetchImportBytes(address, importAllowList(provider))

    const file: UploadFile = {
      data,
      mimetype: mimeType,
      name: importFileName(provider, id, mimeType),
      size: data.byteLength,
    }
    const credit = author ? `${author} / ${label}` : label
    const doc = await engine.create({
      collection: 'media',
      data: {
        alt: importAltText({ title, author }),
        credit,
        license: text(body.license, 200) || (provider === 'openverse' ? 'See source' : ''),
        // Only an https address is stored; anything else (javascript:, http:, a credential-bearing URL) becomes empty.
        sourceUrl: safeHttpsUrl(text(body.sourceUrl, 2048)),
        source: provider,
      },
      file,
      overrideAccess: true,
    })

    return NextResponse.json({
      ok: true,
      doc: { id: doc.id, filename: doc.filename, url: doc.url, alt: doc.alt, credit, source: provider },
    })
  } catch (error) {
    if (error instanceof StockError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Stock import failed:', error)
    return NextResponse.json({ error: 'The picture could not be imported. Try again shortly.' }, { status: 502 })
  }
}