/**
 * Small server helpers shared by the media admin routes: reading the media
 * documents and globals through the engine, and parsing request bodies. Kept
 * in one place so each route stays a sequence of checks and one call.
 */

import type { StoredMedia } from './library'
import { parseId } from './access'
import { resolveOptimiseSettings, type OptimiseSettings } from './optimise'
import type { KeyedProvider, StockKeys } from './stock'

/** The engine methods the media routes use. The real Engine satisfies this structurally. */
export type MediaEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>>; totalDocs?: number }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  findGlobal: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  update: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** Largest number of documents one request may act on. The optimise route takes its own limit from settings. */
export const MAX_IDS_PER_REQUEST = 100

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Distinct positive ids from a request, or null when the list is empty or malformed. */
export function parseIdList(value: unknown, max = MAX_IDS_PER_REQUEST): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null
  const ids: number[] = []
  for (const item of value) {
    const id = parseId(item)
    if (id === null) return null
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

export async function readMediaSettings(engine: MediaEngine): Promise<Record<string, unknown> | null> {
  return engine.findGlobal({ slug: 'media-settings', depth: 0, overrideAccess: true }).catch((): null => null)
}

export async function readOptimiseSettings(engine: MediaEngine): Promise<OptimiseSettings> {
  return resolveOptimiseSettings(await readMediaSettings(engine))
}

/** Reads the stock photo keys. The global's field hooks decrypt them. */
export async function readStockKeys(engine: MediaEngine): Promise<StockKeys> {
  const settings = await readMediaSettings(engine)
  const stock = (settings?.stock ?? {}) as Record<string, unknown>
  const pick = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
  const keys: Record<KeyedProvider, string | null> = {
    unsplash: pick(stock.unsplashAccessKey),
    pexels: pick(stock.pexelsApiKey),
    pixabay: pick(stock.pixabayApiKey),
  }
  return keys
}

/** Presence of each stock key, for the browser. Reports whether a key exists, never its value. */
export async function stockKeyAvailability(engine: MediaEngine): Promise<Record<KeyedProvider, boolean>> {
  const keys = await readStockKeys(engine)
  return { unsplash: Boolean(keys.unsplash), pexels: Boolean(keys.pexels), pixabay: Boolean(keys.pixabay) }
}

export async function loadMedia(engine: MediaEngine, id: number): Promise<(StoredMedia & Record<string, unknown>) | null> {
  const doc = await engine.findByID({ collection: 'media', id, depth: 0, overrideAccess: true }).catch((): null => null)
  if (!doc) return null
  return {
    ...doc,
    id,
    filename: typeof doc.filename === 'string' ? doc.filename : null,
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : null,
    filesize: typeof doc.filesize === 'number' ? doc.filesize : null,
    width: typeof doc.width === 'number' ? doc.width : null,
    height: typeof doc.height === 'number' ? doc.height : null,
    originalSize: typeof doc.originalSize === 'number' ? doc.originalSize : null,
  }
}

/** The database write for one media document, with the engine's access checks bypassed - the route has already authorised the caller. */
export function mediaUpdater(engine: MediaEngine): (id: number, data: Record<string, unknown>) => Promise<unknown> {
  return (id, data) => engine.update({ collection: 'media', id, data, overrideAccess: true })
}
