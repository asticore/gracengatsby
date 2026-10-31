import { fetchCachedText, loadPreviewImage, loadTemplateFile, type FetchDeps } from '@/features/templateRepos/fetch'
import { LIMITS, type Result, type TemplateFile, type TemplateRepoConfig } from '@/features/templateRepos/types'

import { parseLegacyManifestText, parseLibraryText } from './manifest'
import type { LibraryItem, LibraryManifest } from './types'

/**
 * Fetches a library from GitHub: its `library.json`, or for an older template repository its
 * `manifest.json`. Public folders only (no token). Every address is built by the fetcher from the
 * validated repository row, so a library can only ever be read from GitHub's two file hosts.
 */
export async function loadLibraryManifest(config: TemplateRepoConfig, deps: FetchDeps = {}): Promise<Result<LibraryManifest>> {
  const primary = await fetchCachedText(config, 'library.json', null, LIMITS.manifestBytes, deps)
  if (primary.ok) return parseLibraryText(primary.value)
  if (!primary.missing) return { ok: false, error: primary.error }

  const legacy = await fetchCachedText(config, 'manifest.json', null, LIMITS.manifestBytes, deps)
  if (legacy.ok) return parseLegacyManifestText(legacy.value)
  if (legacy.missing) return { ok: false, error: 'This folder has no library.json file. Add one, see the template libraries guide.' }
  return { ok: false, error: legacy.error }
}

/** The template of one item (its tree and the pictures it lists). Refuses a file whose kind differs from the manifest. */
export function loadItemTemplate(config: TemplateRepoConfig, item: LibraryItem, deps: FetchDeps = {}): Promise<Result<TemplateFile>> {
  return loadTemplateFile(config, item, null, deps)
}

/** The preview picture of one item: PNG, JPEG or WebP, checked by its bytes, at most 2 MB. */
export function loadItemPreview(config: TemplateRepoConfig, item: LibraryItem, deps: FetchDeps = {}) {
  return loadPreviewImage(config, item, null, deps)
}
