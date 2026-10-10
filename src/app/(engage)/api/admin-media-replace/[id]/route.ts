import { NextResponse } from 'next/server'

import { authorizeMedia, parseId } from '@/features/media/access'
import { resolveImagesBinding } from '@/features/media/imagesBinding'
import { isCompatibleReplacement, replaceStoredMedia } from '@/features/media/library'
import { prepareUploadFile } from '@/features/media/uploadHook'
import { loadMedia, mediaUpdater, readOptimiseSettings, type MediaEngine } from '@/features/media/store'
import { ValidationError } from '@/localapi/operations'
import type { UploadFile } from '@/localapi/uploads'

/** Largest replacement accepted. Matches the admin's own upload limit for pictures and PDFs. */
const MAX_REPLACE_BYTES = 25 * 1024 * 1024

/**
 * POST /api/admin-media-replace/:id   (multipart: file)
 *
 * Replaces the file behind a document while keeping its filename, so every URL
 * already on the site shows the new picture. Only a compatible type is accepted
 * (picture for picture, PDF for PDF). Optimisation applies when Media Settings
 * asks for it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeMedia('update')
  if (!auth.context) return auth.response

  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const engine = auth.context.engine as unknown as MediaEngine
  const doc = await loadMedia(engine, id)
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!doc.filename || !doc.mimeType) {
    return NextResponse.json({ error: 'This picture has no stored file to replace.' }, { status: 409 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Send a multipart form with a file.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })
  if (file.size > MAX_REPLACE_BYTES) return NextResponse.json({ error: 'Files must be 25 MB or smaller.' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const upload: UploadFile = {
    data: bytes,
    mimetype: file.type || 'application/octet-stream',
    name: file.name || doc.filename,
    size: bytes.length,
  }

  if (!isCompatibleReplacement(doc.mimeType, upload.mimetype)) {
    return NextResponse.json(
      { error: `This file is ${doc.mimeType}. Upload a file of the same kind to replace it.` },
      { status: 415 },
    )
  }

  const settings = await readOptimiseSettings(engine)
  const binding = await resolveImagesBinding()
  const prepared = await prepareUploadFile(upload, {
    readSettings: async () => settings,
    binding: async () => binding,
  })

  try {
    const result = await replaceStoredMedia(
      { ...doc, filename: doc.filename },
      upload,
      prepared,
      settings,
      mediaUpdater(engine),
    )
    return NextResponse.json({ ok: true, result, skipped: prepared.skipped ?? null })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'This file cannot be used.' }, { status: 400 })
    }
    console.error('Replacing media failed:', error)
    return NextResponse.json({ error: 'The file could not be replaced. Try again shortly.' }, { status: 502 })
  }
}