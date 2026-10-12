import type { FormFieldDef } from './types'

import { cleanFileName, inspectUpload, UploadRefusal, type UploadPolicy } from '@/features/media/fileTypes'

/**
 * Files attached to a form entry.
 *
 * The same rules as the Media library (features/media/fileTypes.ts) decide what
 * is acceptable - the extension must be on the allow-list in Media settings and
 * the file's own first bytes must match it; the browser's declared type is
 * never believed - but the files do NOT go into the library. A form attachment
 * is private to whoever may read the entry, so it is stored under
 * `form-uploads/` in the same R2 bucket and served only by an admin route that
 * checks permission (/api/admin-form-file).
 *
 * The stored reference (`StoredFile`) is what lands in the entry's answers. The
 * visitor can never supply one: any value a request sends for a file field is
 * discarded and replaced by what this module produced from the uploaded bytes,
 * so a forged reference cannot point at another entry's file.
 */

export const UPLOAD_PREFIX = 'form-uploads/'
/** Files per file field in one submission. */
export const MAX_FILES_PER_FIELD = 5

export type StoredFile = { key: string; name: string; size: number; type: string }

export type PendingFile = { name: string; type: string; size: number; data: Uint8Array }

export const isStoredFile = (value: unknown): value is StoredFile =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as StoredFile).key === 'string' &&
  (value as StoredFile).key.startsWith(UPLOAD_PREFIX)

/** The extensions a field accepts: its own list narrowed by the site-wide allow-list. */
export function fieldPolicy(field: FormFieldDef, site: UploadPolicy): UploadPolicy {
  const own = (field.accept || '')
    .split(/[\s,;]+/)
    .map((item) => item.replace(/^\*?\./, '').trim().toLowerCase())
    .filter(Boolean)
  const allowedExtensions = own.length > 0 ? site.allowedExtensions.filter((extension) => own.includes(extension)) : site.allowedExtensions
  const mb = typeof field.maxFileMb === 'number' && field.maxFileMb > 0 ? field.maxFileMb : Infinity
  return { allowedExtensions, maxBytes: Math.min(site.maxBytes, Math.floor(mb * 1024 * 1024)) }
}

export type InspectedFile = { file: PendingFile; name: string; type: string }

/**
 * Checks every pending file for one field. Returns the first problem as a
 * message fit to show a visitor, or the files ready to store.
 */
export function inspectFiles(
  field: FormFieldDef,
  files: PendingFile[],
  site: UploadPolicy,
): { error?: string; ok?: InspectedFile[] } {
  if (files.length > MAX_FILES_PER_FIELD) return { error: `Please attach ${MAX_FILES_PER_FIELD} files or fewer.` }
  const policy = fieldPolicy(field, site)
  if (policy.allowedExtensions.length === 0) return { error: 'No file types are allowed for this field.' }
  const ok: InspectedFile[] = []
  for (const file of files) {
    try {
      const inspected = inspectUpload({ name: file.name, mimetype: file.type, data: file.data }, policy)
      ok.push({ file, name: inspected.name, type: inspected.mimeType })
    } catch (error) {
      if (error instanceof UploadRefusal) return { error: error.message }
      return { error: 'That file could not be read.' }
    }
  }
  return { ok }
}

/** A key nobody can guess or collide with: form, month, random token, cleaned name. */
export function buildKey(formId: string | number, name: string, now = new Date(), random: () => string = () => crypto.randomUUID()): string {
  const { base, extension } = cleanFileName(name)
  const month = now.toISOString().slice(0, 7)
  const safeBase = base.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'file'
  return `${UPLOAD_PREFIX}${String(formId).replace(/[^A-Za-z0-9_-]/g, '')}/${month}/${random()}-${safeBase}.${extension || 'bin'}`
}

type BucketLike = { put: (key: string, data: Uint8Array, options: { httpMetadata: { contentType: string } }) => Promise<unknown> }

/** Writes the inspected files to R2 and returns the references to store. */
export async function storeFiles(
  bucket: BucketLike,
  formId: string | number,
  inspected: InspectedFile[],
  now = new Date(),
): Promise<StoredFile[]> {
  const stored: StoredFile[] = []
  for (const item of inspected) {
    const key = buildKey(formId, item.name, now)
    await bucket.put(key, item.file.data, { httpMetadata: { contentType: item.type } })
    stored.push({ key, name: item.name, size: item.file.data.byteLength, type: item.type })
  }
  return stored
}

/** Loads the R2 binding the media library uses. Deferred so this module stays importable from tests and the config. */
export async function getUploadBucket(): Promise<BucketLike & { get: (key: string) => Promise<unknown>; delete: (keys: string | string[]) => Promise<void> }> {
  const { getMediaBucket } = await import('@/localapi/storage')
  return (await getMediaBucket()) as never
}
