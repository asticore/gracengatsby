import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { putMediaObject } from '@/localapi/storage'
import {
  detectFontFormat,
  FONT_FORMATS,
  localFontFileName,
  localFontUrl,
  MAX_FONT_UPLOAD_BYTES,
  sanitizeFamily,
  sanitizeInstalledFonts,
  sanitizeWeights,
  uniqueUploadFontId,
} from '@/features/fonts/installed'
import type { InstalledFont } from '@/features/fonts/types'

/** Largest multipart body accepted: a 2 MB font plus form fields and multipart overhead. */
const MAX_FONT_REQUEST_BYTES = 3 * 1024 * 1024

/**
 * POST /api/admin-fonts-upload  (multipart: file, family, weight, style)
 *
 * Stores one uploaded WOFF2, WOFF or TTF file in R2 and returns the
 * InstalledFont for the form. The format is decided from the file's own
 * bytes, never from its name or the Content-Type the browser sent. The id is
 * chosen so it never overwrites a different family already installed on the site.
 */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('settings:site-settings', 'update'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Refuse an oversized body before formData() buffers it.
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > MAX_FONT_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Font uploads must be 3 MB or smaller.' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Send a multipart form with a font file.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (file.size > MAX_FONT_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Font files must be 2 MB or smaller.' }, { status: 413 })
  }

  const family = sanitizeFamily(form.get('family'))
  if (!family) return NextResponse.json({ error: 'Enter a family name using letters, numbers, spaces or hyphens.' }, { status: 400 })

  const weight = sanitizeWeights([form.get('weight')])[0]
  if (!weight) return NextResponse.json({ error: 'Weight must be 100 to 900 in steps of 100.' }, { status: 400 })

  const styleValue = form.get('style')
  if (styleValue !== null && styleValue !== 'normal' && styleValue !== 'italic') {
    return NextResponse.json({ error: 'Style must be normal or italic.' }, { status: 400 })
  }
  const style = styleValue === 'italic' ? 'italic' : 'normal'

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > MAX_FONT_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Font files must be 2 MB or smaller.' }, { status: 413 })
  }
  const format = detectFontFormat(bytes)
  if (!format) return NextResponse.json({ error: 'That is not a WOFF2, WOFF or TTF font file.' }, { status: 415 })

  let taken: InstalledFont[]
  try {
    const settings = (await context.engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })) as {
      theme?: { customFonts?: unknown }
    } | null
    taken = sanitizeInstalledFonts(settings?.theme?.customFonts)
  } catch (error) {
    console.error('Reading installed fonts failed:', error)
    return NextResponse.json({ error: 'Could not check the installed fonts. Try again shortly.' }, { status: 502 })
  }

  const id = uniqueUploadFontId(family, taken)
  if (!id) return NextResponse.json({ error: 'Enter a family name with at least one letter or number.' }, { status: 400 })

  try {
    const fileName = localFontFileName(id, weight, style, format)
    await putMediaObject(fileName, bytes, FONT_FORMATS[format].mime)
    const font: InstalledFont = {
      id,
      family,
      source: 'upload',
      weights: [weight],
      italic: style === 'italic',
      local: true,
      files: { [`${weight}-${style}`]: localFontUrl(fileName) },
    }
    return NextResponse.json({ font })
  } catch (error) {
    console.error('Font upload failed:', error)
    return NextResponse.json({ error: 'Could not store the font file. Try again shortly.' }, { status: 502 })
  }
}
