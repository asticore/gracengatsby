import { NextResponse } from 'next/server'

/** Extra bytes allowed over the file limit for the multipart envelope (boundaries, field names, text fields). */
export const ENVELOPE_ALLOWANCE = 64 * 1024

const tooBig = (maxBytes: number): Response =>
  NextResponse.json({ error: `Files must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.` }, { status: 413 })

/**
 * Reads a multipart body without ever holding more than `maxBytes` (plus the envelope allowance).
 * With a Content-Length, an oversized request is refused up front. Without one (chunked uploads), the
 * body is read as a stream and stopped as soon as it passes the limit, so the limit holds either way.
 */
export async function readLimitedForm(request: Request, maxBytes: number): Promise<{ form: FormData } | { response: Response }> {
  const limit = maxBytes + ENVELOPE_ALLOWANCE
  const header = request.headers.get('content-length')
  const declared = header === null || header.trim() === '' ? NaN : Number(header)
  if (Number.isFinite(declared) && declared > limit) return { response: tooBig(maxBytes) }

  const bad = (): { response: Response } => ({ response: NextResponse.json({ error: 'Send a multipart form with a file.' }, { status: 400 }) })

  if (Number.isFinite(declared)) {
    try {
      return { form: await request.formData() }
    } catch {
      return bad()
    }
  }

  // No usable Content-Length: count bytes as they arrive.
  if (!request.body) return bad()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch((): void => undefined)
        return { response: tooBig(maxBytes) }
      }
      chunks.push(value)
    }
    const body = new Blob(chunks as BlobPart[])
    const contentType = request.headers.get('content-type') ?? ''
    return { form: await new Response(body, { headers: { 'content-type': contentType } }).formData() }
  } catch {
    return bad()
  }
}
