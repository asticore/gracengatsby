/**
 * Product add-ons: extra questions the buyer answers on the product page (a line of text, a longer
 * text box, a tick box or a drop-down), each with an optional price, either a fixed amount or an
 * amount per character typed. Pure: no I/O, so the storefront and the server share one set of rules.
 *
 * Money is integer cents. Product definitions hold whole dollars (like every other price field), and
 * `normaliseAddOnDefs` is the one place that converts them. The server always prices from the
 * product's own definitions; the values the browser sends are only checked against them.
 */

import { toCents } from './money'

export type AddOnInputType = 'text' | 'textarea' | 'checkbox' | 'select'
export type AddOnPriceMode = 'fixed' | 'perCharacter'

/** One add-on as stored on a product (prices in whole dollars). Missing values mean the default. */
export type AddOnDef = {
  id?: string | null
  label?: string | null
  description?: string | null
  inputType?: string | null
  choices?: string | null
  required?: boolean | null
  price?: number | null
  priceMode?: string | null
  maxLength?: number | null
}

/** A cleaned add-on definition the storefront and the pricing code both use (prices in cents). */
export type AddOnView = {
  id: string
  label: string
  description: string | null
  inputType: AddOnInputType
  choices: string[]
  required: boolean
  priceCents: number
  priceMode: AddOnPriceMode
  maxLength: number
}

/** One answer the buyer gave, as the browser sends it. A tick box sends a boolean, everything else text. */
export type AddOnInput = { id: string; value: string | boolean }

/** An answer that was accepted and priced. `value` is what the buyer sees: the text, or "Yes" for a tick box. */
export type AddOnChoice = { id: string; label: string; value: string; cents: number }

export const MAX_ADD_ONS = 20
export const MAX_ADD_ON_VALUE = 1000
const DEFAULT_TEXT_MAX = 200
const DEFAULT_TEXTAREA_MAX = 1000
const CHOICE_LIMIT = 50

const INPUT_TYPES: AddOnInputType[] = ['text', 'textarea', 'checkbox', 'select']

/** Turns the stored rows of a product's add-ons into clean definitions. Rows without a label are ignored. */
export function normaliseAddOnDefs(raw: unknown): AddOnView[] {
  if (!Array.isArray(raw)) return []
  const out: AddOnView[] = []
  for (const [index, row] of raw.entries()) {
    if (out.length >= MAX_ADD_ONS) break
    if (!row || typeof row !== 'object') continue
    const def = row as AddOnDef
    const label = typeof def.label === 'string' ? def.label.trim().slice(0, 80) : ''
    if (!label) continue
    const inputType = (INPUT_TYPES as string[]).includes(String(def.inputType)) ? (def.inputType as AddOnInputType) : 'text'
    const choices = inputType === 'select' ? splitChoices(def.choices) : []
    if (inputType === 'select' && choices.length === 0) continue // a drop-down with nothing to pick cannot be answered
    const priceDollars = typeof def.price === 'number' && Number.isFinite(def.price) && def.price > 0 ? def.price : 0
    const maxDefault = inputType === 'textarea' ? DEFAULT_TEXTAREA_MAX : DEFAULT_TEXT_MAX
    const maxLength = typeof def.maxLength === 'number' && def.maxLength >= 1 ? Math.min(MAX_ADD_ON_VALUE, Math.floor(def.maxLength)) : maxDefault
    out.push({
      id: typeof def.id === 'string' && def.id ? def.id : `add-on-${index}`,
      label,
      description: typeof def.description === 'string' && def.description.trim() ? def.description.trim().slice(0, 300) : null,
      inputType,
      choices,
      required: def.required === true,
      priceCents: toCents(priceDollars),
      priceMode: def.priceMode === 'perCharacter' ? 'perCharacter' : 'fixed',
      maxLength,
    })
  }
  return out
}

/** Drop-down choices typed as "Small | Medium | Large". Blank entries and repeats are dropped. */
export function splitChoices(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const seen = new Set<string>()
  for (const part of raw.split('|')) {
    const choice = part.trim().slice(0, 80)
    if (choice) seen.add(choice)
    if (seen.size >= CHOICE_LIMIT) break
  }
  return [...seen]
}

/** Reads what the browser sent: an array, or the JSON text it was stored as. Bad entries are dropped. */
export function parseAddOnInputs(raw: unknown): AddOnInput[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: AddOnInput[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: unknown }).id
    const value = (entry as { value?: unknown }).value
    if (typeof id !== 'string' || !id || id.length > 64) continue
    if (typeof value === 'boolean') out.push({ id, value })
    else if (typeof value === 'string') out.push({ id, value: value.slice(0, MAX_ADD_ON_VALUE) })
    if (out.length > MAX_ADD_ONS) break
  }
  return out
}

/** `error` is set (and `ok` false) when an answer is refused; otherwise `cents` and `choices` are the priced answers. */
export type AddOnPricing = { ok: boolean; error: string | null; cents: number; choices: AddOnChoice[] }

/**
 * Checks the buyer's answers against the product's add-ons and prices them. Every required add-on must
 * be answered, a drop-down answer must be one of its choices, text must fit its length, and an answer
 * for an add-on the product does not have is refused. An unanswered optional add-on costs nothing.
 */
export function priceAddOns(defs: AddOnView[], inputs: AddOnInput[]): AddOnPricing {
  const fail = (error: string): AddOnPricing => ({ ok: false, error, cents: 0, choices: [] })
  const byId = new Map(defs.map((def) => [def.id, def]))
  for (const input of inputs) {
    if (!byId.has(input.id)) return fail('One of the options you chose is not available for this product.')
  }
  const answers = new Map(inputs.map((input) => [input.id, input.value]))
  let cents = 0
  const choices: AddOnChoice[] = []
  for (const def of defs) {
    const raw = answers.get(def.id)
    if (def.inputType === 'checkbox') {
      const ticked = raw === true
      if (def.required && !ticked) return fail(`Please tick "${def.label}" to continue.`)
      if (!ticked) continue
      cents += def.priceCents
      choices.push({ id: def.id, label: def.label, value: 'Yes', cents: def.priceCents })
      continue
    }
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (raw !== undefined && typeof raw !== 'string') return fail(`"${def.label}" needs text.`)
    if (text.length > def.maxLength) return fail(`"${def.label}" can be at most ${def.maxLength} characters.`)
    if (def.required && !text) return fail(`Please fill in "${def.label}" to continue.`)
    if (!text) continue
    if (def.inputType === 'select' && !def.choices.includes(text)) return fail(`Choose one of the options for "${def.label}".`)
    const charged = def.priceCents > 0 ? (def.priceMode === 'perCharacter' ? def.priceCents * Array.from(text).length : def.priceCents) : 0
    cents += charged
    choices.push({ id: def.id, label: def.label, value: text, cents: charged })
  }
  return { ok: true, error: null, cents, choices }
}

/** What goes into a cart line: the accepted answers as JSON text, or null when there are none. */
export function storeAddOnChoices(choices: AddOnChoice[]): string | null {
  return choices.length > 0 ? JSON.stringify(choices) : null
}

/** Reads the answers stored on a cart line or an order line. Never throws; bad data reads as no answers. */
export function readAddOnChoices(raw: unknown): AddOnChoice[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .filter((c): c is AddOnChoice => Boolean(c) && typeof c === 'object' && typeof (c as AddOnChoice).label === 'string' && typeof (c as AddOnChoice).value === 'string')
    .map((c) => ({ id: String(c.id ?? ''), label: c.label.slice(0, 80), value: c.value.slice(0, MAX_ADD_ON_VALUE), cents: Number.isFinite(c.cents) ? c.cents : 0 }))
}

/** Plain text for names, invoices and emails: "Engraving: Hi there; Gift wrap: Yes". Empty when there are none. */
export function addOnSummary(choices: Array<Pick<AddOnChoice, 'label' | 'value'>>): string {
  return choices.map((c) => `${c.label}: ${c.value}`).join('; ')
}
