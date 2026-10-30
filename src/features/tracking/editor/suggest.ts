/*
 * Smart suggestions for the tag editor: from a selected element's text, link target or form fields, the likely
 * standard event. Pure, so the mapping is tested without a DOM. English text rules only; anything unmatched returns
 * null and the admin picks the event by hand.
 */

export type TagOption =
  | 'addToCart'
  | 'buyNow'
  | 'checkoutStarted'
  | 'signUp'
  | 'lead'
  | 'bookNow'
  | 'search'
  | 'viewProduct'
  | 'download'
  | 'phone'
  | 'email'
  | 'custom'

export type SuggestInput = {
  /** What the element is, from its tag and role. */
  kind: 'link' | 'button' | 'form' | 'input' | 'other'
  /** Visible text or accessible label. */
  text?: string
  /** For a link: the href attribute as written. */
  href?: string
  /** For a form: the action attribute as written. */
  formAction?: string
  hasEmailField?: boolean
  hasPasswordField?: boolean
  hasSearchField?: boolean
  /** For a link: the download attribute is present. */
  download?: boolean
}

export type Suggestion = { option: TagOption; reason: 'text' | 'href' | 'form' }

const TEXT_RULES: Array<[RegExp, TagOption]> = [
  [/add (to|in) (the )?(cart|bag|basket)/, 'addToCart'],
  [/\bbuy now\b|\bpurchase\b|\border now\b/, 'buyNow'],
  [/check ?out|proceed to pay/, 'checkoutStarted'],
  [/\bbook( now| a| your)?\b|reserve (a|your) (spot|place|seat)/, 'bookNow'],
  [/sign ?up|register|join now|create (an )?account/, 'signUp'],
  [/\bdownload\b|\bpdf\b/, 'download'],
  [/\bsearch\b/, 'search'],
  [/contact us|\benquir|get in touch|request a quote|\bget a quote\b/, 'lead'],
]

const HREF_RULES: Array<[RegExp, TagOption]> = [
  [/\/checkout(\/|$|\?|#)/, 'checkoutStarted'],
  [/\/search(\/|$|\?|#)/, 'search'],
  [/\.pdf(\?|#|$)/i, 'download'],
  [/\/shop\/[^/?#]+/, 'viewProduct'],
  [/\/book(ing)?(\/|$|\?|#)/, 'bookNow'],
  [/\/(sign-?up|register)(\/|$|\?|#)/, 'signUp'],
  [/\/contact(\/|$|\?|#)/, 'lead'],
]

/** The likely standard event for a selected element, or null when nothing matches. */
export function suggestEvent(input: SuggestInput): Suggestion | null {
  const text = (input.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const href = (input.href ?? '').trim()
  const action = (input.formAction ?? '').trim()

  if (input.kind === 'form' || (input.kind === 'button' && action)) {
    if (input.hasPasswordField) return { option: 'signUp', reason: 'form' }
    if (input.hasSearchField || /\/search(\/|$|\?)/.test(action)) return { option: 'search', reason: 'form' }
    if (/\/checkout(\/|$|\?|#)/.test(action)) return { option: 'checkoutStarted', reason: 'form' }
    if (input.hasEmailField || input.kind === 'form') return { option: 'lead', reason: 'form' }
  }

  if (/^tel:/i.test(href)) return { option: 'phone', reason: 'href' }
  if (/^mailto:/i.test(href)) return { option: 'email', reason: 'href' }

  for (const [pattern, option] of TEXT_RULES) {
    if (text && pattern.test(text)) return { option, reason: 'text' }
  }

  if (input.download) return { option: 'download', reason: 'href' }
  for (const [pattern, option] of HREF_RULES) {
    if (pattern.test(href)) return { option, reason: 'href' }
  }
  return null
}
