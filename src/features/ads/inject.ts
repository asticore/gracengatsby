/**
 * Where automatic placements land inside content and lists.
 * Pure: takes nodes in, returns a plan; rendering is somebody else's job.
 */

export type ParagraphRule = {
  /** Placement key to render at this spot. */
  key: string
  /** Insert after this many paragraphs (1 based). */
  after: number
  /** Then again every this many paragraphs. 0 means once. */
  repeatEvery: number
  /** Most times this rule may fire on one page. */
  max: number
}

export type Segment<T> = { type: 'nodes'; nodes: T[] } | { type: 'ad'; key: string }

type RichNode = { type?: string; text?: unknown; children?: unknown }

const hasText = (node: unknown): boolean => {
  if (!node || typeof node !== 'object') return false
  const n = node as RichNode
  if (typeof n.text === 'string' && n.text.trim()) return true
  return Array.isArray(n.children) && n.children.some(hasText)
}

/** A real paragraph: a top-level paragraph node with some text in it (an empty line does not count). */
export const isCountedParagraph = (node: unknown): boolean => Boolean(node) && (node as RichNode).type === 'paragraph' && hasText(node)

/**
 * Splits top-level rich text nodes into runs of content and ad slots.
 *
 * An ad is never placed after the last paragraph when nothing follows it, or
 * after the final node: an ad at the very end is the footer placement's job,
 * and one that trails a short article just looks like the article is over.
 * `budget` is how many ads the rest of the page may still show.
 */
export function planAfterParagraphs<T>(nodes: readonly T[], rules: readonly ParagraphRule[], budget: number): { segments: Segment<T>[]; used: number } {
  // Paragraph ordinal for each node index (0 when the node is not a counted paragraph).
  const ordinal: number[] = []
  let count = 0
  nodes.forEach((node, i) => {
    if (isCountedParagraph(node)) count += 1
    ordinal[i] = isCountedParagraph(node) ? count : 0
  })

  const fired = new Map<string, number>()
  const adAfter = new Map<number, string>()
  let used = 0
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = ordinal[i]!
    if (!n) continue
    for (const rule of rules) {
      if (used >= budget) break
      if (adAfter.has(i)) break
      const times = fired.get(rule.key) ?? 0
      if (times >= rule.max) continue
      const hit = n === rule.after || (rule.repeatEvery > 0 && n > rule.after && (n - rule.after) % rule.repeatEvery === 0)
      if (!hit) continue
      adAfter.set(i, rule.key)
      fired.set(rule.key, times + 1)
      used += 1
    }
  }

  const segments: Segment<T>[] = []
  let run: T[] = []
  nodes.forEach((node, i) => {
    run.push(node)
    const key = adAfter.get(i)
    if (key) {
      segments.push({ type: 'nodes', nodes: run })
      segments.push({ type: 'ad', key })
      run = []
    }
  })
  if (run.length) segments.push({ type: 'nodes', nodes: run })
  return { segments, used }
}

/**
 * Indexes (0 based, in the list) AFTER which an in-feed ad goes: with every = 3
 * and 10 items, after items 3, 6 and 9 (indexes 2, 5, 8). Never after the last item.
 */
export function inFeedPositions(total: number, every: number, max = 10): number[] {
  if (!Number.isInteger(total) || !Number.isInteger(every) || every < 2 || total < 2) return []
  const out: number[] = []
  for (let n = every; n < total && out.length < max; n += every) out.push(n - 1)
  return out
}
