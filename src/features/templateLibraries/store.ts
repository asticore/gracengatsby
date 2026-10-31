import { TEMPLATE_LIBRARIES_SLUG } from './settings'
import { parseLibraryUrl } from './url'
import { LIBRARY_LIMITS, type LibraryRow } from './types'

/**
 * Reads and writes the `template-libraries` global. Server side only. The engine is passed in, so the
 * routes and tests use the same code. Writes send both arrays whole, so a partial save never drops rows.
 */

/** The slice of the engine this store uses. */
export type LibraryStoreEngine = {
  findGlobal: (args: { slug: string; depth: number; overrideAccess: boolean }) => Promise<unknown>
  updateGlobal: (args: { slug: string; data: Record<string, unknown>; user?: unknown; overrideAccess?: boolean }) => Promise<unknown>
  findByID: (args: { collection: string; id: number; depth: number; overrideAccess: boolean }) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<{ id: number | string; url?: unknown }>
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
}

/** One picture already in the media gallery, keyed by the hash of its bytes. */
export type ImportRecord = { sha256: string; mediaId: number; sourceUrl: string }

export type LibraryState = { rows: LibraryRow[]; imports: ImportRecord[] }

const isOff = (value: unknown): boolean => value === false || value === 0 || value === '0' || value === 'false'

export function normaliseLibraryState(raw: unknown): LibraryState {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as { libraries?: unknown; imports?: unknown }
  const libraries = Array.isArray(doc.libraries) ? doc.libraries.slice(0, LIBRARY_LIMITS.maxLibraries) : []
  const rows: LibraryRow[] = libraries.map((item, index): LibraryRow => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const id = typeof row.id === 'string' && row.id ? row.id : String(index + 1)
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    const label = typeof row.label === 'string' ? row.label.trim().slice(0, LIBRARY_LIMITS.labelMaxLength) : ''
    const enabled = !isOff(row.enabled)
    const parsed = parseLibraryUrl(url, label)
    if (parsed.ok) return { id, label: parsed.value.config.label, url: parsed.value.url, enabled, config: parsed.value.config, error: null }
    return { id, label: label || url || `Library ${index + 1}`, url, enabled, config: null, error: (parsed as { error: string }).error }
  })
  const imports = Array.isArray(doc.imports)
    ? doc.imports
        .map((item) => {
          const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
          return {
            sha256: typeof record.sha256 === 'string' ? record.sha256 : '',
            mediaId: Number(record.mediaId),
            sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : '',
          }
        })
        .filter((record) => /^[0-9a-f]{64}$/.test(record.sha256) && Number.isInteger(record.mediaId) && record.mediaId > 0)
    : []
  return { rows, imports }
}

export async function readLibraryState(engine: LibraryStoreEngine): Promise<LibraryState> {
  const doc = await engine.findGlobal({ slug: TEMPLATE_LIBRARIES_SLUG, depth: 0, overrideAccess: true }).catch((): null => null)
  return normaliseLibraryState(doc)
}

export type LibraryWrite = { id?: string; label: string; url: string; enabled: boolean }

/** Saves the whole list and the picture records. Records beyond the cap are dropped oldest first. */
export async function writeLibraryState(engine: LibraryStoreEngine, libraries: LibraryWrite[], imports: ImportRecord[], user?: unknown): Promise<void> {
  await engine.updateGlobal({
    slug: TEMPLATE_LIBRARIES_SLUG,
    data: {
      libraries: libraries.slice(0, LIBRARY_LIMITS.maxLibraries).map((row) => ({ id: row.id, label: row.label, url: row.url, enabled: row.enabled })),
      imports: imports.slice(-LIBRARY_LIMITS.maxImports).map((record) => ({ sha256: record.sha256, mediaId: record.mediaId, sourceUrl: record.sourceUrl })),
    },
    user,
    overrideAccess: true,
  })
}
