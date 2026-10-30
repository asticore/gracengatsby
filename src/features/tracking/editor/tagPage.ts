/*
 * The page an existing tag lives on, so "Open in editor" from the tracking events table can load it. An exact or
 * starts-with rule names a path; a contains rule or "any" has no single page, so the home page is used. Pure.
 */
import { normaliseRulePath } from '../urlRule'

export function tagPagePath(tag: { urlMatchMode: string | null; urlMatch: string | null }): string {
  const mode = tag.urlMatchMode ?? 'any'
  if ((mode === 'exact' || mode === 'starts') && tag.urlMatch && tag.urlMatch.trim()) {
    return normaliseRulePath(tag.urlMatch)
  }
  return '/'
}
