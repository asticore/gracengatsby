/**
 * Which pages put a form on them. Pure, so the admin screens and the tests share one rule.
 *
 * A page refers to a form in two ways: a `form` page-builder block (`{ blockType: 'form', form: <id> }`,
 * possibly nested in sections and columns), or a shortcode paragraph in rich text (`[form id="<embed key>"]`).
 * The walk does not need to know the page layout's shape: it visits every object and array under the
 * page's blocks, so a new container type is found without a change here.
 */

import { shortcodeFormId } from './shortcode'

export type PageUseStatus = 'published' | 'draft'

/** A page as the scan reads it. Only the fields the list shows are kept. */
export type PageUsePage = {
  id: number | string
  title?: string
  slug?: string
  status?: PageUseStatus
  /** Public address, when one can be worked out (see pageLiveHref). */
  liveHref?: string
  blocks?: unknown
}

export type PageUse = { id: number | string; title: string; status: PageUseStatus; liveHref?: string }

const MAX_DEPTH = 60

const refId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (value && typeof value === 'object' && 'id' in value) return refId((value as { id?: unknown }).id)
  return null
}

/** Collects the form ids and shortcode keys a page-builder value refers to, into `out`. */
export function collectFormRefs(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > MAX_DEPTH || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collectFormRefs(item, out, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const node = value as Record<string, unknown>
  if (node.blockType === 'form') {
    const id = refId(node.form)
    if (id) out.add(id)
  }
  const shortcode = shortcodeFormId(node)
  if (shortcode) out.add(shortcode)
  for (const key of Object.keys(node)) {
    const child = node[key]
    if (child && typeof child === 'object') collectFormRefs(child, out, depth + 1)
  }
}

export type FormForUsage = { id: number | string; embedKey?: string | null }

/**
 * Maps each form id to the pages that use it. A shortcode may name a form by its embed key, so both the id
 * and the key count. A page is listed once per form even when it uses the form twice.
 */
export function pagesUsingForms(forms: FormForUsage[], pages: PageUsePage[]): Map<string, PageUse[]> {
  const byRef = new Map<string, string>()
  for (const form of forms) {
    byRef.set(String(form.id), String(form.id))
    if (form.embedKey) byRef.set(form.embedKey, String(form.id))
  }
  const result = new Map<string, PageUse[]>()
  for (const page of pages) {
    const refs = new Set<string>()
    collectFormRefs(page.blocks, refs)
    const formIds = new Set<string>()
    for (const ref of refs) {
      const formId = byRef.get(ref)
      if (formId) formIds.add(formId)
    }
    for (const formId of formIds) {
      const list = result.get(formId) ?? []
      list.push({ id: page.id, title: page.title || page.slug || `#${page.id}`, status: page.status ?? 'published', liveHref: page.liveHref })
      result.set(formId, list)
    }
  }
  return result
}
