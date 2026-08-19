import type { FieldHook } from 'payload'

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

/**
 * A reusable beforeValidate hook that auto-generates a URL-friendly slug from
 * a source field (defaults to `title`) whenever the `slug` field is left blank.
 */
export const formatSlugHook = (fallbackField = 'title'): FieldHook => {
  return ({ data, value }) => {
    if (typeof value === 'string' && value.length > 0) {
      return slugify(value)
    }

    const fallback = data?.[fallbackField]

    if (typeof fallback === 'string' && fallback.length > 0) {
      return slugify(fallback)
    }

    return value
  }
}
