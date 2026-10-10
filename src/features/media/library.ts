/**
 * Operations on pictures that already exist in the library: re-optimising them
 * in place and replacing their file. The routes do the auth and validation;
 * this module does the work, and takes storage and database writes as
 * arguments so the tests can run it without R2 or D1.
 *
 * Write order: when a stored file is rewritten, the database row is updated
 * first and the bytes second. If the bytes fail to write, the row is put back
 * to its previous values, so the database never describes a file that is not
 * there.
 */

import { generateUploadFields, isImageMimeType, normaliseMimeType, probeImageDimensions, type UploadFile } from '@/localapi/uploads'
import { putMediaObject, putOriginalIfMissing, readMediaObject } from '@/localapi/storage'

import { isOptimisableMimeType, optimiseBytes, scaledDimensions, type ImagesBinding, type OptimiseSettings } from './optimise'
import type { PreparedUpload } from './uploadHook'

/** The storage calls the operations need. Defaults to the real R2 helpers. */
export type StorageIO = {
  read: (key: string) => Promise<{ data: Uint8Array; contentType: string } | null>
  put: (key: string, data: Uint8Array, contentType: string) => Promise<void>
  putOriginalIfMissing: (filename: string, data: Uint8Array, contentType: string) => Promise<boolean>
}

export const defaultStorageIO: StorageIO = {
  read: readMediaObject,
  put: putMediaObject,
  putOriginalIfMissing,
}

/** A database write for one media document. Defaults are supplied by the route. */
export type UpdateMedia = (id: number, data: Record<string, unknown>) => Promise<unknown>

export type StoredMedia = {
  id: number
  filename: string | null
  mimeType: string | null
  filesize?: number | null
  width?: number | null
  height?: number | null
  originalSize?: number | null
  optimizedSize?: number | null
}

export type OptimiseItemResult = {
  id: number
  status: 'optimised' | 'kept' | 'skipped' | 'failed'
  reason?: string
  /** Set when the stored file name keeps an extension that no longer matches the bytes. */
  note?: string
  /** Bytes before the run, as stored. */
  before: number | null
  /** Bytes after the run. Null unless the file was rewritten. */
  after: number | null
}

/** The row values a rewrite changes. Captured before the write so a failed write can put them back. */
function snapshotOf(doc: StoredMedia): Record<string, unknown> {
  return {
    mimeType: doc.mimeType ?? null,
    filesize: doc.filesize ?? null,
    width: doc.width ?? null,
    height: doc.height ?? null,
    originalSize: doc.originalSize ?? null,
    optimizedSize: doc.optimizedSize ?? null,
  }
}

/** Extensions a stored file of each type is expected to carry. Types not listed are not checked. */
const EXPECTED_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/avif': ['avif'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
}

/**
 * A note for when the file is served with a type its name does not match
 * (a `.jpg` that is now WebP). The name is kept so links keep working; the
 * note tells the admin why the extension is not the format.
 */
export function extensionNote(filename: string, mimeType: string): string | undefined {
  const expected = EXPECTED_EXTENSIONS[mimeType]
  if (!expected) return undefined
  const extension = filename.includes('.') ? (filename.split('.').pop() ?? '').toLowerCase() : ''
  if (expected.includes(extension)) return undefined
  return `Stored as ${mimeType} under the existing name ${filename}, so existing links keep working. The name keeps its original extension.`
}

/**
 * Re-encodes one stored picture and writes it back under the same filename, so
 * every URL that already points at it keeps working. The first original is
 * kept first when keepOriginals is on, and the database row records both sizes.
 * A picture that already has an optimised size is skipped unless `force` is set.
 */
export async function optimiseStoredMedia(
  doc: StoredMedia,
  settings: OptimiseSettings,
  binding: ImagesBinding,
  update: UpdateMedia,
  io: StorageIO = defaultStorageIO,
  options: { force?: boolean } = {},
): Promise<OptimiseItemResult> {
  const before = typeof doc.filesize === 'number' ? doc.filesize : null
  const result = (status: OptimiseItemResult['status'], extra: Partial<OptimiseItemResult> = {}): OptimiseItemResult => ({
    id: doc.id,
    status,
    before,
    after: null,
    ...extra,
  })

  if (!doc.filename) return result('failed', { reason: 'This picture has no stored file.' })
  if (!options.force && typeof doc.optimizedSize === 'number' && doc.optimizedSize > 0) {
    return result('skipped', { reason: 'Already optimised. Run it again with force to re-encode it.' })
  }
  if (!isOptimisableMimeType(doc.mimeType)) {
    return result('skipped', { reason: 'Only JPEG, PNG and WebP pictures are optimised. This file is kept as it is.' })
  }

  try {
    const stored = await io.read(doc.filename)
    if (!stored) return result('failed', { reason: 'The file is missing from storage.' })

    const outcome = await optimiseBytes(binding, stored.data, doc.mimeType, settings)
    if (outcome.status !== 'optimised') {
      return result(outcome.status === 'kept' ? 'kept' : 'skipped', { reason: outcome.reason })
    }

    if (settings.keepOriginals) {
      await io.putOriginalIfMissing(doc.filename, stored.data, doc.mimeType)
    }

    const dims = dimensionsAfter(outcome.data, outcome.mimeType, doc, settings)
    const previous = snapshotOf(doc)
    await update(doc.id, {
      mimeType: outcome.mimeType,
      filesize: outcome.optimizedSize,
      width: dims.width,
      height: dims.height,
      originalSize: doc.originalSize ?? outcome.originalSize,
      optimizedSize: outcome.optimizedSize,
    })
    try {
      await io.put(doc.filename, outcome.data, outcome.mimeType)
    } catch (error) {
      await update(doc.id, previous).catch((restoreError: unknown) => console.error(`Restoring media ${doc.id} failed.`, restoreError))
      throw error
    }

    return result('optimised', {
      before: outcome.originalSize,
      after: outcome.optimizedSize,
      note: extensionNote(doc.filename, outcome.mimeType),
    })
  } catch (error) {
    console.error(`Optimising media ${doc.id} failed.`, error)
    return result('failed', { reason: 'The picture could not be optimised. The original is unchanged.' })
  }
}

/**
 * Pixel size after the re-encode. Probed from the new bytes where the probe
 * understands the format; otherwise worked out from the scale the transform
 * applied, which is exact for scale-down.
 */
function dimensionsAfter(
  data: Uint8Array,
  mimeType: string,
  doc: StoredMedia,
  settings: OptimiseSettings,
): { width: number | null; height: number | null } {
  if (!doc.width || !doc.height) return { width: doc.width ?? null, height: doc.height ?? null }
  const fallback = scaledDimensions(doc.width, doc.height, settings.maxWidth, settings.maxHeight)
  try {
    const probed = probeImageDimensions(data, mimeType)
    return { width: probed.width, height: probed.height }
  } catch {
    return { width: fallback.width, height: fallback.height }
  }
}

/**
 * Whether a new file may take the place of the old one. A picture stays a
 * picture (any image for any image), a PDF stays a PDF, and anything else only
 * with the same type. SVG is never accepted: it is a script-capable document.
 */
export function isCompatibleReplacement(currentMimeType: string, nextMimeType: string): boolean {
  const current = normaliseMimeType(currentMimeType)
  const next = normaliseMimeType(nextMimeType)
  if (current === 'image/svg+xml' || next === 'image/svg+xml') return false
  const family = (type: string): string => (isImageMimeType(type) ? 'image' : type)
  if (family(current) !== family(next)) return false
  return family(current) === 'image' || current === next
}

export type ReplaceResult = {
  mimeType: string
  filesize: number
  width: number | null
  height: number | null
  originalSize: number
  optimizedSize: number | null
  note?: string
}

/**
 * Replaces the file behind an existing document. The stored filename is kept,
 * so every link keeps working; the new file and its type replace the old ones.
 * Throws the engine's validation error for disallowed types, so the route can
 * map it to a 400.
 */
export async function replaceStoredMedia(
  doc: StoredMedia & { filename: string },
  file: UploadFile,
  prepared: PreparedUpload,
  settings: OptimiseSettings,
  update: UpdateMedia,
  io: StorageIO = defaultStorageIO,
): Promise<ReplaceResult> {
  // generateUploadFields runs the same restricted-type and name checks as an
  // upload, on the name the visitor sent. The name it returns is ignored: the
  // existing filename is kept on purpose.
  const fields = await generateUploadFields({
    file: prepared.file,
    filenameExists: async () => false,
    optimisation: { originalSize: prepared.originalSize, optimised: prepared.optimised },
  })

  // Read the version being replaced before anything is written. It is kept if
  // asked for and not already held: the first version ever seen is the one held.
  const current = settings.keepOriginals ? await io.read(doc.filename) : null
  if (current) await io.putOriginalIfMissing(doc.filename, current.data, current.contentType)

  const result: ReplaceResult = {
    mimeType: fields.mimeType,
    filesize: fields.filesize,
    width: fields.width ?? null,
    height: fields.height ?? null,
    originalSize: fields.originalSize ?? file.size,
    optimizedSize: fields.optimizedSize ?? null,
    note: extensionNote(doc.filename, fields.mimeType),
  }

  // Row first, then bytes. A failed write puts the row back to what it was.
  const previous = snapshotOf(doc)
  await update(doc.id, {
    mimeType: result.mimeType,
    filesize: result.filesize,
    width: result.width,
    height: result.height,
    originalSize: result.originalSize,
    optimizedSize: result.optimizedSize,
  })
  try {
    await io.put(doc.filename, prepared.file.data, fields.mimeType)
  } catch (error) {
    await update(doc.id, previous).catch((restoreError: unknown) => console.error(`Restoring media ${doc.id} failed.`, restoreError))
    throw error
  }
  return result
}

/** Longest alt text kept. Screen readers and search engines both read a short phrase best. */
export const MAX_ALT_LENGTH = 125

/** Trims generated or typed alt text to one line of at most MAX_ALT_LENGTH characters, with control characters removed. */
export function cleanAltText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ALT_LENGTH)
    .trim()
}

/** Most documents the folder listing reads. Above this the list is cut short and reported as truncated. */
export const MAX_FOLDER_SCAN = 5000
const FOLDER_PAGE_SIZE = 500

/**
 * Reads every media document a page at a time, up to `cap`. `truncated` is true
 * only when more documents exist than the cap allows.
 */
export async function collectMediaDocs<T>(
  findPage: (page: number, limit: number) => Promise<{ docs: T[]; hasNextPage?: boolean }>,
  cap = MAX_FOLDER_SCAN,
): Promise<{ docs: T[]; truncated: boolean }> {
  const docs: T[] = []
  for (let page = 1; ; page += 1) {
    const result = await findPage(page, FOLDER_PAGE_SIZE)
    docs.push(...result.docs)
    const more = result.hasNextPage ?? result.docs.length === FOLDER_PAGE_SIZE
    if (!more || result.docs.length === 0) return { docs, truncated: false }
    if (docs.length >= cap) return { docs: docs.slice(0, cap), truncated: true }
  }
}
