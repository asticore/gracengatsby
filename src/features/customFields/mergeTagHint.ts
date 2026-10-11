/**
 * Pure helper: the merge tag an editor should paste for one extra field.
 *
 * Document fields are read as {{field:<key>}}. Fields on an options page are
 * read as {{option:<slug>.<key>}}. Fields inside repeating rows or flexible
 * layouts add a row index after the row field's name, so the first row's
 * first sub field is {{field:rows.0.column}}.
 */

export type MergeTagParent = { name: string; type: string }

export type MergeTagMode = 'document' | 'option'

export type MergeTagInput = {
  name: string
  type?: string
  /** Enclosing fields, outermost first. */
  parentPath?: MergeTagParent[]
  /** `document` for a page, post and so on; `option` for an options page. */
  mode?: MergeTagMode
  /** The options page slug, when the set is attached to one. */
  optionsSlug?: string | null
}

export type MergeTagInfo = { tag: string; note: string | null }

/** Shown in place of the slug when an options set has no slug yet. */
export const OPTION_SLUG_PLACEHOLDER = '<slug>'

const ROW_TYPES = new Set(['repeater', 'flexible'])

export function mergeTagFor(input: MergeTagInput): MergeTagInfo {
  const { name, type, parentPath = [], mode = 'document', optionsSlug } = input

  const segments: string[] = []
  let indexed = false
  for (const parent of parentPath) {
    segments.push(parent.name)
    if (ROW_TYPES.has(parent.type)) {
      segments.push('0')
      indexed = true
    }
  }
  segments.push(name)
  const key = segments.join('.')

  const slug = optionsSlug || OPTION_SLUG_PLACEHOLDER
  const tag = mode === 'option' ? `{{option:${slug}.${key}}}` : `{{field:${key}}}`

  const notes: string[] = []
  if (mode === 'option' && !optionsSlug) notes.push('Replace <slug> with the options page slug.')
  if (type && ROW_TYPES.has(type)) {
    notes.push(`This field holds rows, so paste a column tag instead, such as {{field:${key}.0.column}}.`)
  }
  if (indexed) notes.push('Tip: change 0 to 1 for the second row, 2 for the third.')

  return { tag, note: notes.length ? notes.join(' ') : null }
}