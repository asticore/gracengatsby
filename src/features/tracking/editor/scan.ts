/*
 * Scans the framed page for likely tags: the buttons, links and forms that a tracking event usually belongs to.
 * Read-only: nothing on the page is changed. Pure DOM logic, so it is tested under jsdom.
 */
import { bestSelector } from '../picker/selector'
import { onThisPage, type TagRow } from '../tagRows'
import { defaultTrigger, describeElement, elementMatches } from './frameDom'
import { suggestEvent, type Suggestion } from './suggest'

/** Clickable things worth a suggestion. Submit buttons inside a form are left to the form itself. */
const CANDIDATES = 'a[href], button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], form'

export type ScanRow = {
  /** Position in the scan, stable for one scan. */
  key: number
  element: Element
  text: string
  suggestion: Suggestion
  selector: string
  matches: number
  /** True when a saved tag on this page already matches the element. */
  added: boolean
  trigger: 'click' | 'submit'
}

export type ScanOptions = {
  /** Skip elements with no layout box (hidden or collapsed). The live editor sets this; tests do not. */
  skipHidden?: boolean
}

export function scanPage(doc: Document, tags: readonly TagRow[], path: string, options: ScanOptions = {}): ScanRow[] {
  const rows: ScanRow[] = []
  const seen = new Set<Element>()
  const pageTags = tags.filter((tag) => onThisPage(tag, path) && tag.selector)
  for (const el of Array.from(doc.querySelectorAll(CANDIDATES))) {
    if (seen.has(el)) continue
    // A submit button inside a form belongs to the form's row.
    const control = el as HTMLButtonElement | HTMLInputElement
    if ((el.tagName === 'BUTTON' || el.tagName === 'INPUT') && control.type !== 'button' && control.type !== 'reset' && control.form) continue
    if (options.skipHidden && el.getClientRects().length === 0) continue
    seen.add(el)
    const suggestion = suggestEvent(describeElement(el))
    if (!suggestion) continue
    const best = bestSelector(el, doc)
    const added = pageTags.some((tag) => elementMatches(el, tag.selector as string))
    rows.push({
      key: rows.length,
      element: el,
      text: describeElement(el).text ?? '',
      suggestion,
      selector: best?.selector ?? '',
      matches: best?.matches ?? 0,
      added,
      trigger: defaultTrigger(el),
    })
  }
  return rows
}
