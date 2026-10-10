/**
 * Optimise-on-upload.
 *
 * The engine's create and update paths (src/localapi/engine.ts) call
 * `prepareUploadFile` before any metadata is computed, and
 * `storePreparedUpload` instead of a bare putMediaObject. When Media Settings
 * asks for optimisation, the bytes that reach R2 (and the filename, size and
 * type recorded in the database) are the smaller copy. Nothing is ever failed
 * because of optimisation: any problem falls back to the upload exactly as sent.
 */

import type { UploadFile } from '@/localapi/uploads'
import { putMediaObject, putOriginalIfMissing } from '@/localapi/storage'

import {
  IMAGES_UNAVAILABLE_MESSAGE,
  isOptimisableMimeType,
  optimiseBytes,
  renameForMimeType,
  resolveOptimiseSettings,
  type ImagesBinding,
  type OptimiseSettings,
} from './optimise'
import { resolveImagesBinding } from './imagesBinding'

export type PreparedUpload = {
  /** The file to store: the optimised copy when one was made, otherwise the file as sent. */
  file: UploadFile
  optimised: boolean
  /** Size the visitor sent, before any re-encode. */
  originalSize: number
  /** The untouched upload, kept only when keepOriginals is on and the bytes were changed. */
  keepOriginal: { data: Uint8Array; mimetype: string } | null
  /** Why optimisation was asked for but did not happen. Shown to the admin, never an error. */
  skipped?: string
}

export type PrepareDeps = {
  readSettings: () => Promise<OptimiseSettings>
  binding: () => Promise<ImagesBinding | null>
}

/** Reads Media Settings through the engine. Imported lazily to keep the engine and this module out of each other's load graph. */
async function readSettingsFromEngine(): Promise<OptimiseSettings> {
  try {
    const { getEngine } = await import('@/lib/engine')
    const engine = await getEngine()
    const raw = await engine.findGlobal({ slug: 'media-settings', depth: 0, overrideAccess: true }).catch((): null => null)
    return resolveOptimiseSettings(raw)
  } catch {
    return resolveOptimiseSettings(null)
  }
}

const defaultDeps: PrepareDeps = {
  readSettings: readSettingsFromEngine,
  binding: resolveImagesBinding,
}

export async function prepareUploadFile(file: UploadFile, deps: PrepareDeps = defaultDeps): Promise<PreparedUpload> {
  const untouched: PreparedUpload = { file, optimised: false, originalSize: file.size, keepOriginal: null }
  try {
    if (!isOptimisableMimeType(file.mimetype)) return untouched

    const settings = await deps.readSettings()
    if (!settings.enabled) return untouched

    const binding = await deps.binding()
    if (!binding) return { ...untouched, skipped: IMAGES_UNAVAILABLE_MESSAGE }

    const outcome = await optimiseBytes(binding, file.data, file.mimetype, settings)
    if (outcome.status !== 'optimised') return { ...untouched, skipped: outcome.reason }

    const optimisedFile: UploadFile = {
      data: outcome.data,
      mimetype: outcome.mimeType,
      name: renameForMimeType(file.name, outcome.mimeType),
      size: outcome.data.byteLength,
    }
    return {
      file: optimisedFile,
      optimised: true,
      originalSize: file.size,
      keepOriginal: settings.keepOriginals ? { data: file.data, mimetype: file.mimetype } : null,
    }
  } catch (error) {
    // Optimisation is a convenience: a failure stores the upload as sent.
    console.error('Optimising an upload failed; the file was stored as uploaded.', error)
    return untouched
  }
}

/**
 * Writes a prepared upload to R2 under its generated filename. The original
 * (when kept) is written first, so a failure part-way never leaves only the
 * smaller copy with no way back.
 */
export async function storePreparedUpload(filename: string, prepared: PreparedUpload): Promise<void> {
  if (prepared.keepOriginal) {
    await putOriginalIfMissing(filename, prepared.keepOriginal.data, prepared.keepOriginal.mimetype)
  }
  await putMediaObject(filename, prepared.file.data, prepared.file.mimetype)
}
