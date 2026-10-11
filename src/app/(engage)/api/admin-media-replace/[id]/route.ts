import { NextResponse } from 'next/server'

import { authorizeMedia, parseId } from '@/features/media/access'
import { inspectUpload } from '@/features/media/fileTypes'
import { resolveImagesBinding } from '@/features/media/imagesBinding'
import { isCompatibleReplacement, replaceStoredMedia } from '@/features/media/library'
import { prepareUploadFile } from '@/features/media/uploadHook'
import { readLimitedForm } from '@/features/media/readBody'
import { loadMedia, mediaUpdater, readOptimiseSettings, readUploadPolicy, type MediaEngine } from '@/features/media/store'
import { ValidationError } from '@/localapi/operations'
import type { UploadFile } from '@/localapi/uploads'

/**
 * POST /api/admin-media-replace/:id   (multipart: file)
 *
 * Replaces the file behind a document while keeping its filename, so every URL
 * already on the site shows the new picture. Only a compatible type is accepted
 * (picture for picture, and any other file for the same type of file). Optimisation applies when Media Settings
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

  const policy = await readUploadPolicy(engine)
  // Refuse an oversized body before it is read into memory (also when no Content-Length is sent).
  const read = await readLimitedForm(request, policy.maxBytes)
  if ('response' in read) return read.response
  const form = read.form
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })

  // Refuse on the declared size before reading the body into memory.
  if (file.size > policy.maxBytes) {
    return NextResponse.json({ error: `Files must be ${Math.round(policy.maxBytes / (1024 * 1024))} MB or smaller.` }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const upload: UploadFile = {
    data: bytes,
    mimetype: file.type || 'application/octet-stream',
    name: file.name || doc.filename,
    size: bytes.length,
  }

  const settings = await readOptimiseSettings(engine)
  const binding = await resolveImagesBinding()
  let prepared
  try {
    // Checks the type from the file's own bytes, not the browser's claim.
    prepared = await prepareUploadFile(upload, {
      readSettings: async () => settings,
      binding: async () => binding,
      readPolicy: async () => policy,
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'This file cannot be used.' }, { status: 415 })
    }
    throw error
  }

  // Compared on the type found from the bytes (before any re-encode), not the declared one.
  const detected = inspectUpload(upload, policy).mimeType
  if (!isCompatibleReplacement(doc.mimeType, detected)) {
    return NextResponse.json(
      { error: `This file is ${doc.mimeType}. Upload a file of the same kind to replace it.` },
      { status: 415 },
    )
  }

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