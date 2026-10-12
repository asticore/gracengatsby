import { forEachText } from './textFields'

/**
 * Reading time for a post: the words in its text, at about 200 a minute, never
 * less than one minute for a post with any words at all. Computed on every save
 * by the posts beforeChange hook, so the stored number never goes stale.
 */

export const WORDS_PER_MINUTE = 200

const stripTags = (text: string): string => text.replace(/<[^>]*>/g, ' ')

/** Words in a piece of content (rich text tree, blocks or plain strings under text keys). */
export function countWords(...sources: unknown[]): number {
  let words = 0
  for (const source of sources) {
    if (typeof source === 'string') {
      words += stripTags(source).split(/\s+/).filter(Boolean).length
      continue
    }
    forEachText(source, (text) => {
      words += stripTags(text).split(/\s+/).filter(Boolean).length
    })
  }
  return words
}

/** Whole minutes to read, or null when there are no words. */
export function readingMinutes(...sources: unknown[]): number | null {
  const words = countWords(...sources)
  if (words === 0) return null
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

/** "3 min read", or '' when there is no reading time. */
export function readingTimeLabel(minutes: unknown): string {
  const n = Number(minutes)
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} min read` : ''
}

/**
 * Posts beforeChange hook: sets `readingTime` from the content as it will be
 * after this save (fields the request did not send keep their stored value).
 * Needs no user, so it also runs for imports and scheduled writes.
 */
export const readingTimeBeforeChange = ({ data, originalDoc }: { data: Record<string, unknown>; originalDoc?: Record<string, unknown> }): void => {
  const content = 'content' in data ? data.content : originalDoc?.content
  const layout = 'layout' in data ? data.layout : originalDoc?.layout
  data.readingTime = readingMinutes(content, layout)
}
