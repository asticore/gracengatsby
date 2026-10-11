/**
 * Browser side of media upload: asks the server what is allowed, checks each
 * file before sending, and sends files one request each so every file has its
 * own progress bar and its own error. Used by the media library page, the
 * create screen and the upload picker in documents.
 */

export type UploadRules = { accept: string[]; maxBytes: number }

export type UploadedDoc = {
  id: number | string
  filename: string
  url: string
  alt: string
  mimeType: string
  filesize: number
}

export type UploadOutcome = { ok: true; doc: UploadedDoc; altDrafted: boolean } | { ok: false; error: string }

/** Largest number of files in flight at once. Each is held in memory on the server while it uploads. */
export const UPLOAD_CONCURRENCY = 3

let cachedRules: Promise<UploadRules | null> | null = null

/** What the library accepts right now. Null when it could not be read; the server then does all the checking. */
export function loadUploadRules(): Promise<UploadRules | null> {
  if (!cachedRules) {
    cachedRules = fetch('/api/admin-media-upload', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return null
        const body = (await response.json()) as Partial<UploadRules>
        return Array.isArray(body.accept) && typeof body.maxBytes === 'number' ? { accept: body.accept, maxBytes: body.maxBytes } : null
      })
      .catch((): null => null)
  }
  return cachedRules
}

export function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}

/** A message when the file clearly will not be accepted, so it is never sent; null when it may be tried. */
export function precheck(file: { name: string; size: number }, rules: UploadRules | null): string | null {
  if (file.size === 0) return 'That file is empty.'
  if (!rules) return null
  if (file.size > rules.maxBytes) return `Too large (${formatLimit(file.size)}). The limit is ${formatLimit(rules.maxBytes)}.`
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (extension && !rules.accept.includes(extension)) return `${extension} files are not allowed here.`
  return null
}

/** Sends one file with progress (0 to 1). Resolves, never rejects. */
export function uploadFile(file: File, options: { folder?: string; alt?: string; onProgress?: (fraction: number) => void } = {}): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const form = new FormData()
    form.append('file', file, file.name)
    if (options.folder) form.append('folder', options.folder)
    if (options.alt) form.append('alt', options.alt)

    const request = new XMLHttpRequest()
    request.open('POST', '/api/admin-media-upload')
    request.withCredentials = true
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total)
    }
    request.onerror = () => resolve({ ok: false, error: 'The upload could not be sent. Check your connection and try again.' })
    request.ontimeout = () => resolve({ ok: false, error: 'The upload took too long. Try a smaller file.' })
    request.onload = () => {
      let body: { ok?: boolean; error?: string; doc?: UploadedDoc; altDrafted?: boolean } | null = null
      try {
        body = JSON.parse(request.responseText)
      } catch {
        body = null
      }
      if (request.status >= 200 && request.status < 300 && body?.ok && body.doc) {
        options.onProgress?.(1)
        resolve({ ok: true, doc: body.doc, altDrafted: Boolean(body.altDrafted) })
        return
      }
      const fallback = request.status === 413 ? 'That file is larger than the upload limit.' : `The upload failed (${request.status}).`
      resolve({ ok: false, error: body?.error ?? fallback })
    }
    request.send(form)
  })
}

/** Runs `task` over `items` with at most `limit` running at once. */
export async function runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await task(item)
    }
  })
  await Promise.all(workers)
}
