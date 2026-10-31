import { loadLibraryManifest } from './loader'
import { readLibraryState, type LibraryStoreEngine } from './store'
import type { LibraryItem, LibraryItemRow, LibrarySummary } from './types'

/** The path of a library item's preview picture, served through the library routes (never a GitHub URL). */
export function previewPathFor(libraryId: string, slug: string): string {
  return `/api/template-libraries/preview?library=${encodeURIComponent(libraryId)}&item=${encodeURIComponent(slug)}`
}

export type LibraryListing = { libraries: LibrarySummary[]; items: LibraryItemRow[] }

/**
 * Every enabled library with its manifest, plus the combined item list the hub and the visual editor show.
 * One library failing never hides the others: its error is reported on its own row.
 */
export async function listLibraries(engine: LibraryStoreEngine, options: { fresh?: boolean } = {}): Promise<LibraryListing> {
  const state = await readLibraryState(engine)
  const deps = options.fresh ? { bypassCache: true } : {}
  const loaded = await Promise.all(
    state.rows.map(async (row) => (row.enabled && row.config ? loadLibraryManifest(row.config, deps) : null)),
  )

  const libraries: LibrarySummary[] = []
  const items: LibraryItemRow[] = []
  state.rows.forEach((row, index) => {
    const summary: LibrarySummary = { id: row.id, label: row.label, url: row.url, enabled: row.enabled, name: null, itemCount: 0, error: row.error }
    const result = loaded[index]
    if (result && result.ok) {
      summary.name = result.value.name
      summary.itemCount = result.value.items.length
      for (const item of result.value.items as LibraryItem[]) {
        items.push({
          key: `${row.id}:${item.slug}`,
          libraryId: row.id,
          libraryLabel: row.label,
          slug: item.slug,
          title: item.title,
          kind: item.kind,
          category: item.category,
          tags: item.tags,
          previewUrl: previewPathFor(row.id, item.slug),
        })
      }
    } else if (result && !result.ok) {
      summary.error = result.error
    }
    libraries.push(summary)
  })
  return { libraries, items }
}

/** Finds a saved library row and one of its manifest items. Both are looked up by the saved id and the item slug. */
export async function findLibraryItem(
  engine: LibraryStoreEngine,
  libraryId: string,
): Promise<{ ok: true; row: Awaited<ReturnType<typeof readLibraryState>>['rows'][number]; manifestItems: LibraryItem[]; error?: undefined; status?: undefined } | { ok: false; error: string; status: number; row?: undefined; manifestItems?: undefined }> {
  const state = await readLibraryState(engine)
  const row = state.rows.find((candidate) => candidate.id === libraryId)
  if (!row || !row.enabled || !row.config) return { ok: false, error: 'That library is not available.', status: 404 }
  const manifest = await loadLibraryManifest(row.config)
  if (!manifest.ok) return { ok: false, error: manifest.error, status: 502 }
  return { ok: true, row, manifestItems: manifest.value.items }
}
