import { relinkAssets, type AssetIdMap } from './assets'
import { cleanRelativePath } from './manifest'
import { loadAssetFile, type FetchDeps } from './fetch'
import { sanitizeTemplateTree } from './sanitize'
import type { Result, TemplateFile, TemplateRepoConfig } from './types'

/**
 * Inserting a repository template that has pictures. Every picture is downloaded
 * from the template's own repository (the fixed GitHub hosts in ./fetch.ts, never
 * a URL taken from the template), checked, saved as a normal media item through
 * the same creation path as an upload, and the tree is re-pointed at the new
 * media. Nothing is saved unless every picture passed its checks.
 */

export const ASSET_LIMITS = { maxAssets: 20, maxBytes: 5 * 1024 * 1024 } as const

export type UploadFileLike = { data: Uint8Array; mimetype: string; name: string; size: number }

export type InsertAssetsDeps = FetchDeps & {
  /** Saves one picture through the media library's own create call. Returns the new media id and URL. */
  createMedia: (file: UploadFileLike, alt: string) => Promise<{ id: number; url: string }>
  /** Largest picture in bytes (never above ASSET_LIMITS.maxBytes). */
  maxBytes?: number
}

export type InsertAssetsOptions = {
  repo: TemplateRepoConfig
  token: string | null
  template: TemplateFile
  /** Keep raw HTML elements. Only honoured when the template itself says `requires.rawHtml === true`. */
  allowRawHtml?: boolean
}

export type InsertAssetsResult = { idMap: AssetIdMap; tree: unknown[]; saved: number }

const toHex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return toHex(await crypto.subtle.digest('SHA-256', copy.buffer))
}

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function fileNameFor(path: string, mime: string): string {
  const base = (path.split('/').pop() ?? 'picture').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80) || 'picture'
  return `${base}.${EXTENSION[mime] ?? 'png'}`
}

export async function insertTemplateAssets(options: InsertAssetsOptions, deps: InsertAssetsDeps): Promise<Result<InsertAssetsResult>> {
  const { repo, token, template } = options
  const sanitizeOptions = { allowRawHtml: options.allowRawHtml === true && template.requires?.rawHtml === true }
  const assets = template.assets ?? []
  if (assets.length > ASSET_LIMITS.maxAssets) {
    return { ok: false, error: `This template lists more than ${ASSET_LIMITS.maxAssets} pictures, which is the most that can be added at once.` }
  }
  const maxBytes = Math.min(deps.maxBytes ?? ASSET_LIMITS.maxBytes, ASSET_LIMITS.maxBytes)

  // Pass 1: download and check everything. Nothing is saved yet.
  const checked: Array<{ key: string; url?: string; path: string; alt: string; bytes: Uint8Array; mime: string }> = []
  for (const asset of assets) {
    const key = typeof asset.id === 'string' ? asset.id : ''
    const path = cleanRelativePath(asset.path, { strict: true })
    if (!key || !path) return { ok: false, error: 'A picture in this template has no valid id or path.' }
    const loaded = await loadAssetFile(repo, path, token, maxBytes, deps)
    if (!loaded.ok) return { ok: false, error: `Picture "${path}": ${loaded.error}` }
    if (asset.sha256) {
      const actual = await sha256Hex(loaded.value.bytes)
      if (actual !== asset.sha256.toLowerCase()) return { ok: false, error: `Picture "${path}" does not match its checksum, so it was not added.` }
    }
    checked.push({ key, path, alt: (asset.alt ?? '').slice(0, 300), bytes: loaded.value.bytes, mime: loaded.value.contentType })
  }

  // Pass 2: save through the media library.
  const idMap: AssetIdMap = {}
  for (const item of checked) {
    try {
      const doc = await deps.createMedia(
        { data: item.bytes, mimetype: item.mime, name: fileNameFor(item.path, item.mime), size: item.bytes.byteLength },
        item.alt,
      )
      idMap[item.key] = { id: doc.id, url: doc.url }
    } catch {
      return { ok: false, error: `Picture "${item.path}" could not be saved to the media library.` }
    }
  }

  const tree = relinkAssets(sanitizeTemplateTree(template.tree, sanitizeOptions), idMap)
  return { ok: true, value: { idMap, tree, saved: checked.length } }
}
