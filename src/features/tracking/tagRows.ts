/*
 * The tracking event rows the editor works with, and the rules that decide which of them belong to a page. Pure:
 * shared by the editor, the scan and the tests.
 */
import { urlMatches, type UrlMatchMode } from './events'
import { matchingElements } from './editor/frameDom'

export type TagRow = {
  id: number
  name: string
  platformEvent: string
  triggerType: string
  selector: string | null
  urlMatchMode: string | null
  urlMatch: string | null
  value: number | null
  currency: string | null
  valueSource?: string | null
  valueRef?: string | null
  valueSelector?: string | null
  enabled: boolean
}

/** Whether a saved tag applies to a page path (its URL rule, ignoring language prefixes). */
export function onThisPage(tag: Pick<TagRow, 'urlMatchMode' | 'urlMatch' | 'selector'>, path: string): boolean {
  return Boolean(tag.selector) && urlMatches({ urlMatchMode: (tag.urlMatchMode as UrlMatchMode | null) ?? 'any', urlMatch: tag.urlMatch }, path)
}

export type TagPageStatus = { tag: TagRow; found: boolean; count: number }

/** Every tag whose URL rule matches the page, with whether its selector still finds an element in the framed document. */
export function tagsOnPageStatus(tags: readonly TagRow[], path: string, doc: Document | null): TagPageStatus[] {
  return tags
    .filter((tag) => onThisPage(tag, path))
    .map((tag) => {
      const count = doc && tag.selector ? matchingElements(doc, tag.selector).length : 0
      return { tag, found: count > 0, count }
    })
}
