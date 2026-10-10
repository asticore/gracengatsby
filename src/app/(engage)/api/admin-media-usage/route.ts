import { NextResponse } from 'next/server'

import { authorizeMedia, parseId } from '@/features/media/access'
import { scanMediaUsage } from '@/features/media/usage'
import { loadMedia, type MediaEngine } from '@/features/media/store'

/**
 * GET /api/admin-media-usage?id=<n>[&scan=0]
 *
 * Returns the picture's stored details, and - unless scan=0 - every place it is
 * referenced. scan=0 is a cheap read used by the focal point editor.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeMedia('read')
  if (!auth.context) return auth.response

  const url = new URL(request.url)
  const id = parseId(url.searchParams.get('id'))
  if (id === null) return NextResponse.json({ error: 'Choose a picture.' }, { status: 400 })

  const engine = auth.context.engine as unknown as MediaEngine
  const doc = await loadMedia(engine, id)
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const media = {
    id,
    url: typeof doc.url === 'string' ? doc.url : null,
    filename: doc.filename,
    mimeType: doc.mimeType,
    width: doc.width,
    height: doc.height,
    alt: typeof doc.alt === 'string' ? doc.alt : '',
    focalX: typeof doc.focalX === 'number' ? doc.focalX : 50,
    focalY: typeof doc.focalY === 'number' ? doc.focalY : 50,
    crop: doc.crop ?? null,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
  }

  if (url.searchParams.get('scan') === '0') return NextResponse.json({ media })

  const adminRoute = auth.context.engine.config?.routes?.admin ?? '/admin'
  const report = await scanMediaUsage(engine, id, adminRoute)
  return NextResponse.json({ media, ...report })
}