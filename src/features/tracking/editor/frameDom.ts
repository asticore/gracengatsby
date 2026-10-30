/*
 * DOM helpers for the tag editor's same-origin frame. They read the framed page and never change it: no classes,
 * no attributes, no injected nodes. Overlays are drawn by the editor over the frame.
 */
import { suggestEvent, type Suggestion, type SuggestInput } from './suggest'

/** Elements that act on the site (a cart, a sign-up, a send), which the editor keeps from running. Links are not here. */
const ACTION_SELECTOR = 'button, input[type="submit"], input[type="button"], input[type="reset"], input[type="image"], [role="button"], summary'

/** Whether a click on this element would act on the site rather than navigate. */
export function isActionElement(el: Element): boolean {
  return Boolean(el.closest(ACTION_SELECTOR))
}

/** The nearest link with an href, or null. */
export function linkOf(el: Element): HTMLAnchorElement | null {
  return el.closest('a[href]') as HTMLAnchorElement | null
}

/** Matches of a CSS selector in a document, or none when the selector does not parse. */
export function matchingElements(doc: Document, selector: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(selector))
  } catch {
    return []
  }
}

/** Whether one element matches a selector. A bad selector matches nothing. */
export function elementMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector)
  } catch {
    return false
  }
}

const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

/** The text an admin would read on the element: its label, its value, or its visible text, shortest useful form. */
export function visibleText(el: Element): string {
  const aria = clean(el.getAttribute('aria-label'))
  if (aria) return aria
  if (el instanceof HTMLInputElement) return clean(el.value || el.placeholder || el.name)
  return clean(el.textContent).slice(0, 120)
}

/**
 * What the suggestion rules need, read from the clicked element. A form is described by its fields; a link by its
 * href and download attribute; any other element by its text.
 */
export function describeElement(el: Element): SuggestInput {
  const form = el instanceof HTMLFormElement ? el : (el.closest('form') as HTMLFormElement | null)
  const fields = form ? Array.from(form.querySelectorAll('input, textarea, select')) : []
  const fieldInfo = {
    hasEmailField: fields.some((f) => (f as HTMLInputElement).type === 'email' || /email/i.test(f.getAttribute('name') ?? '')),
    hasPasswordField: fields.some((f) => (f as HTMLInputElement).type === 'password'),
    hasSearchField: fields.some((f) => (f as HTMLInputElement).type === 'search' || /search|query|\bq\b/i.test(f.getAttribute('name') ?? '')),
  }
  const link = el.closest('a[href]') as HTMLAnchorElement | null
  if (el instanceof HTMLFormElement) {
    return { kind: 'form', text: visibleText(el), formAction: el.getAttribute('action') ?? '', ...fieldInfo }
  }
  if (link && el.tagName !== 'BUTTON' && !(el instanceof HTMLInputElement && el.type === 'submit')) {
    return { kind: 'link', text: visibleText(link) || visibleText(el), href: link.getAttribute('href') ?? '', download: link.hasAttribute('download') }
  }
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el.getAttribute('role') === 'button') {
    const isSubmit = el instanceof HTMLButtonElement ? el.type !== 'button' && el.type !== 'reset' : el instanceof HTMLInputElement && el.type === 'submit'
    const action = isSubmit && form ? form.getAttribute('action') ?? '' : ''
    return { kind: 'button', text: visibleText(el), formAction: action, ...fieldInfo }
  }
  return { kind: 'other', text: visibleText(el), ...fieldInfo }
}

/** The trigger a new tag starts with: a form submit for a form, a click for everything else. */
export function defaultTrigger(el: Element): 'click' | 'submit' {
  if (el instanceof HTMLFormElement) return 'submit'
  if (el instanceof HTMLButtonElement && el.type === 'submit' && el.form) return 'submit'
  if (el instanceof HTMLInputElement && el.type === 'submit' && el.form) return 'submit'
  return 'click'
}

/** The suggestion for an element, or null. */
export function suggestFor(el: Element): Suggestion | null {
  return suggestEvent(describeElement(el))
}
