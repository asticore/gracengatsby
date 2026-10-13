/**
 * Pure matcher and replacer for the admin find-and-replace tool. No engine,
 * no database: the route feeds it documents and writes back what it returns.
 *
 * Text is only ever changed where textFields.ts says it is readable text
 * (mapText), so ids, URLs, block types and rich-text node structure are never
 * touched. A phrase that Lexical has split across two text nodes (for example
 * half of it bold) is not found, because each node is searched on its own.
 */

import { mapText } from './textFields'

export const FIND_REPLACE_COLLECTIONS = ['pages', 'posts', 'products', 'events'] as const
export type FindReplaceCollection = (typeof FIND_REPLACE_COLLECTIONS)[number]

export const FIND_REPLACE_LIMITS = {
  findMaxLength: 200,
  replaceMaxLength: 500,
  /** Documents read per collection for one preview or apply. Past this the result is marked truncated. */
  scanDocsPerCollection: 2000,
  /** An apply refuses to change more documents than this in one go. */
  applyMaxDocs: 200,
  /** Samples returned by a preview. */
  sampleCount: 50,
  /** Characters of context shown on each side of a match. */
  contextChars: 40,
} as const

export type FindReplaceOptions = {
  find: string
  replace: string
  caseSensitive: boolean
  wholeWord: boolean
  collections: FindReplaceCollection[]
}

export type FindReplaceSample = {
  collection: FindReplaceCollection
  id: number | string
  title: string
  field: string
  before: string
  match: string
  after: string
}

/** Keys that are never searched, whatever they contain. */
const SYSTEM_KEYS: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt', 'trashedAt'])

const isCollection = (value: unknown): value is FindReplaceCollection =>
  typeof value === 'string' && (FIND_REPLACE_COLLECTIONS as readonly string[]).includes(value)

/** Validates an untrusted request body. Returns the options or a plain-English reason. */
export function parseFindReplace(body: unknown): { ok: true; options: FindReplaceOptions } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a JSON body.' }
  const b = body as Record<string, unknown>
  if (typeof b.find !== 'string' || b.find.trim() === '') return { ok: false, error: 'Type the text to find.' }
  if (b.find.length > FIND_REPLACE_LIMITS.findMaxLength) {
    return { ok: false, error: `The text to find can be at most ${FIND_REPLACE_LIMITS.findMaxLength} characters.` }
  }
  if (typeof b.replace !== 'string') return { ok: false, error: 'Type the replacement text (it can be empty to delete the text).' }
  if (b.replace.length > FIND_REPLACE_LIMITS.replaceMaxLength) {
    return { ok: false, error: `The replacement can be at most ${FIND_REPLACE_LIMITS.replaceMaxLength} characters.` }
  }
  if (!Array.isArray(b.collections) || b.collections.length === 0) return { ok: false, error: 'Choose at least one place to search.' }

  const collections: FindReplaceCollection[] = []
  for (const raw of b.collections) {
    if (!isCollection(raw)) return { ok: false, error: 'Find and replace works on pages, posts, products and events.' }
    if (!collections.includes(raw)) collections.push(raw)
  }

  const caseSensitive = b.caseSensitive === true
  const wholeWord = b.wholeWord === true
  if (!caseSensitive && b.replace === b.find) {
    return { ok: false, error: 'The replacement is the same as the text to find, so nothing would change.' }
  }
  return { ok: true, options: { find: b.find, replace: b.replace, caseSensitive, wholeWord, collections } }
}

/** Escapes every character that means something inside a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The pattern for the find text. Global, so every match in a string is seen.
 * Whole-word mode means a letter, digit or underscore may not sit directly
 * before or after the match (Unicode aware, so accented words work).
 */
export function buildPattern(find: string, options: { caseSensitive: boolean; wholeWord: boolean }): RegExp {
  const body = escapeRegExp(find)
  const word = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body
  return new RegExp(word, options.caseSensitive ? 'gu' : 'giu')
}

/** A label a person can read for a field key, such as "seoTitle" -> "Seo title". */
export function humaniseField(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export type ReplaceOutcome = {
  /** Matches that would change (a match equal to its replacement is not counted). */
  count: number
  /** The document's top-level fields that changed, ready to pass to an update. Empty when nothing changed. */
  patch: Record<string, unknown>
  /** Up to `maxSamples` matches with their surrounding text. */
  samples: Array<{ field: string; before: string; match: string; after: string }>
}

/**
 * Finds and replaces inside one document's readable text. Returns the update
 * patch (only the fields that changed), the match count and sample contexts.
 * Pure: the input document is not modified.
 */
export function replaceInDocument(
  doc: Record<string, unknown>,
  pattern: RegExp,
  replacement: string,
  maxSamples = 0,
  contextChars: number = FIND_REPLACE_LIMITS.contextChars,
): ReplaceOutcome {
  const outcome: ReplaceOutcome = { count: 0, patch: {}, samples: [] }

  for (const key of Object.keys(doc)) {
    if (SYSTEM_KEYS.has(key) || key.startsWith('_')) continue
    let fieldCount = 0

    // Wrapping the field in its own key lets mapText see the field name, so a
    // top-level title or description is treated as text too.
    const mapped = mapText({ [key]: doc[key] }, (text) =>
      text.replace(pattern, (match: string, offset: number) => {
        if (match === replacement) return match
        fieldCount += 1
        if (outcome.samples.length < maxSamples) {
          outcome.samples.push({
            field: humaniseField(key),
            before: text.slice(Math.max(0, offset - contextChars), offset),
            match,
            after: text.slice(offset + match.length, offset + match.length + contextChars),
          })
        }
        return replacement
      }),
    )

    if (fieldCount > 0 && mapped.changed > 0) {
      outcome.count += fieldCount
      outcome.patch[key] = (mapped.value as Record<string, unknown>)[key]
    }
  }
  return outcome
}
