/**
 * Holding back markup until its category is granted.
 *
 * Custom head and body code is editor-supplied HTML, so it is rewritten on the
 * server rather than parsed in the browser:
 *   - each <script> becomes <script type="text/plain" data-consent-category>.
 *     The browser does not run a text/plain script, and the original type is
 *     kept in data-consent-type so it can be restored.
 *   - every other run of markup (an image pixel, an iframe, a style block) is
 *     wrapped in <template data-consent-category>. Nothing inside a template is
 *     fetched or rendered until it is copied out.
 *
 * Once the category is granted, activateGatedMarkup() puts the real elements in
 * place. Scripts are recreated rather than moved, because a script that was
 * parsed inside a template is not guaranteed to run when it is moved.
 *
 * Only the pure transform and the attribute helper live here at the top. The
 * DOM function is safe to import on the server because it does nothing until
 * it is called.
 */

import { type ConsentChoices, type CookieCategory } from './consent'

const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const TYPE_ATTRIBUTE = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

export const GATE_SELECTOR = 'template[data-consent-category], script[type="text/plain"][data-consent-category]'

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Attributes for a server-rendered element that should wait for a category. */
export function consentGateAttrs(category: CookieCategory): { 'data-consent-category': CookieCategory } {
  return { 'data-consent-category': category }
}

/**
 * Rewrites custom HTML so it waits for `category`. Necessary code is returned
 * unchanged, because it has to run at once.
 */
export function gateHtml(html: string, category: CookieCategory): string {
  if (category === 'necessary') return html

  const out: string[] = []
  let last = 0

  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    const index = match.index ?? 0
    pushTemplate(out, html.slice(last, index), category)

    const attributes = match[1] ?? ''
    const body = match[2] ?? ''
    const typeMatch = TYPE_ATTRIBUTE.exec(attributes)
    const originalType = typeMatch ? (typeMatch[1] ?? typeMatch[2] ?? typeMatch[3] ?? '') : ''
    const rest = attributes.replace(TYPE_ATTRIBUTE, '')
    const typeAttribute = originalType ? ` data-consent-type="${escapeAttribute(originalType)}"` : ''

    out.push(`<script type="text/plain" data-consent-category="${category}"${typeAttribute}${rest}>${body}</script>`)
    last = index + match[0].length
  }

  pushTemplate(out, html.slice(last), category)
  return out.join('')
}

function pushTemplate(out: string[], segment: string, category: CookieCategory): void {
  if (segment.trim()) out.push(`<template data-consent-category="${category}">${segment}</template>`)
}

/** Copies a script so the browser treats it as new and runs it. */
function recreateScript(source: HTMLScriptElement, restoreType: boolean): HTMLScriptElement {
  const script = document.createElement('script')
  for (const attribute of Array.from(source.attributes)) {
    // type is always dropped here: the text/plain marker must not survive, and
    // the original type (if any) is put back from data-consent-type below.
    if (attribute.name === 'data-consent-category' || attribute.name === 'data-consent-type' || attribute.name === 'type') continue
    script.setAttribute(attribute.name, attribute.value)
  }
  const originalType = source.getAttribute('data-consent-type')
  if (restoreType && originalType) script.setAttribute('type', originalType)
  script.text = source.textContent ?? ''
  return script
}

/**
 * Puts gated markup in place for every category that is now granted. Returns
 * how many blocks were activated. Idempotent: an activated block is removed,
 * so a second call finds nothing new.
 */
export function activateGatedMarkup(root: Document | Element, choices: ConsentChoices): number {
  let activated = 0
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(GATE_SELECTOR))) {
    const category = element.getAttribute('data-consent-category')
    if (!category || !(category in choices) || !choices[category as keyof ConsentChoices]) continue

    if (element instanceof HTMLTemplateElement) {
      const fragment = element.content.cloneNode(true) as DocumentFragment
      for (const script of Array.from(fragment.querySelectorAll('script'))) {
        script.replaceWith(recreateScript(script, false))
      }
      element.replaceWith(fragment)
    } else if (element instanceof HTMLScriptElement) {
      element.replaceWith(recreateScript(element, true))
    }
    activated += 1
  }
  return activated
}
