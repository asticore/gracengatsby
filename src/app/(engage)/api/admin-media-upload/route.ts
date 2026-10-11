import { NextResponse } from 'next/server'

import { authorizeMedia } from '@/features/media/access'
import { ACCEPTED_TYPES, fileKindOf } from '@/features/media/fileTypes'
import { readLimitedForm } from '@/features/media/readBody'
import { readUploadPolicy, type MediaEngine } from '@/features/media/store'
import { ValidationError } from '@/localapi/operations'
import type { UploadFile } from '@/localapi/uploads'

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** A readable starting alt text from a picture's file name: `harbour_sunset-2.jpg` becomes `harbour sunset 2`. */
function altFromName(name: string): string {
  return name
    .replace(/\.[^.]*$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 125)
}

/**
 * GET /api/admin-media-upload
 *
 * What the browser needs to prepare an upload: the allowed extensions (for the
 * file picker's `accept` list) and the size limit (to refuse an oversized file
 * before sending it).
 */
export async function GET(): Promise<Response> {
  const auth = await authorizeMedia('create')
  if (!auth.context) return auth.response
  const policy = await readUploadPolicy(auth.context.engine as unknown as MediaEngine)
  const accept = ACCEPTED_TYPES.filter((type) => policy.allowedExtensions.includes(type.extension)).map((type) => `.${type.extension}`)
  return NextResponse.json({ accept, maxBytes: policy.maxBytes })
}

/**
 * POST /api/admin-media-upload   (multipart: file, alt?, caption?, folder?)
 *
 * Uploads ONE file to the library. The library page sends several files as
 * several requests so each gets its own progress and its own error. The file is
 * checked from its own bytes against the allow-list in Media settings (see
 * features/media/fileTypes.ts), then stored through the same engine call as the
 * regular upload form, so optimisation, folders and name collisions behave
 * identically.
 *
 * Alt text is required for pictures only: a picture sent without it gets one
 * drafted from its file name (flagged in the reply so the page can say so).
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeMedia('create')
  if (!auth.context) return auth.response
  const engine = auth.context.engine as unknown as MediaEngine
  const policy = await readUploadPolicy(engine)

  // Refuse an oversized body before it is read into memory (also when no Content-Length is sent).
  const read = await readLimitedForm(request, policy.maxBytes)
  if ('response' in read) return read.response
  const form = read.form
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })
  if (file.size > policy.maxBytes) {
    return NextResponse.json({ error: `Files must be ${Math.round(policy.maxBytes / (1024 * 1024))} MB or smaller.` }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const upload: UploadFile = { data: bytes, mimetype: file.type || 'application/octet-stream', name: file.name || 'upload', size: bytes.length }

  const alt = text(form.get('alt'), 300)
  const folder = text(form.get('folder'), 200).replace(/^\/+|\/+$/g, '')
  const caption = text(form.get('caption'), 300)

  try {
    // Pictures need alt text; give a draft when none was typed so a batch of pictures can go in at once.
    const looksLikePicture = fileKindOf(upload.mimetype) === 'image' || /\.(jpe?g|png|gif|webp|avif)$/i.test(upload.name)
    const altText = alt || (looksLikePicture ? altFromName(upload.name) : '')
    const doc = await engine.create({
      collection: 'media',
      data: { alt: altText, caption, folder, source: 'upload' },
      file: upload,
      overrideAccess: true,
    })
    const isPicture = typeof doc.mimeType === 'string' && doc.mimeType.startsWith('image/')
    return NextResponse.json({
      ok: true,
      doc: {
        id: doc.id,
        filename: doc.filename,
        url: doc.url,
        alt: doc.alt,
        mimeType: doc.mimeType,
        filesize: doc.filesize,
        width: doc.width ?? null,
        height: doc.height ?? null,
      },
      altDrafted: isPicture && !alt,
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      const message = error.errors[0]?.message ?? 'This file cannot be used.'
      // A type or content refusal is a 415; anything else the form got wrong is a 400.
      return NextResponse.json({ error: message }, { status: error.errors[0]?.path === 'file' ? (/MB or smaller/.test(message) ? 413 : 415) : 400 })
    }
    console.error('Media upload failed:', error)
    return NextResponse.json({ error: 'The file could not be saved. Try again shortly.' }, { status: 502 })
  }
}
