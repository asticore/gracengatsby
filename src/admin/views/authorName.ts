/**
 * Pure helper to resolve an author's display name from various formats.
 *
 * Takes an author in various forms (id string, id number, or a populated user object)
 * and returns a display name following this precedence:
 * 1. If author has a `name` property, return it
 * 2. Else if author has an `email` property, return it
 * 3. Else return 'Unknown'
 *
 * Used by RevisionsBox and VersionsList to display who last edited a version.
 */

/**
 * Resolve an author's display name from an author value.
 * @param author - The author value: null, undefined, id string/number, or user object
 * @returns Display name (name, email, or 'Unknown')
 */
export function resolveName(author: unknown): string {
  // Null, undefined, or plain string/number (id only) -> Unknown
  if (author == null) return 'Unknown'
  if (typeof author === 'string' || typeof author === 'number') return 'Unknown'

  // Object: try name, then email
  if (typeof author === 'object') {
    const obj = author as Record<string, unknown>
    if (typeof obj.name === 'string' && obj.name.length > 0) return obj.name
    if (typeof obj.email === 'string' && obj.email.length > 0) return obj.email
  }

  return 'Unknown'
}
