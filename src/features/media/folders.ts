/**
 * Folder paths for the media library. A folder is a plain text path such as
 * `products/summer` - no separate table, so there is nothing to keep in step.
 * Empty means the top level.
 */

export const MAX_FOLDER_LENGTH = 120

/**
 * Tidies a folder path typed by an admin. Returns the stored form, or null when
 * the input cannot be a folder (too long, or characters outside letters,
 * numbers, spaces, hyphens, underscores and slashes).
 */
export function sanitizeFolder(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  if (cleaned === '') return ''
  if (cleaned.length > MAX_FOLDER_LENGTH) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _\-/]*$/u.test(cleaned)) return null
  return cleaned
}

/** The distinct, non-empty folders in a set of documents, sorted. */
export function distinctFolders(docs: Array<{ folder?: string | null }>): string[] {
  const seen = new Set<string>()
  for (const doc of docs) {
    const folder = typeof doc.folder === 'string' ? doc.folder.trim() : ''
    if (folder) seen.add(folder)
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b))
}
