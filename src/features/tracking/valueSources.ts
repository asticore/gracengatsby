/*
 * Browser-side facts for the value sources: the text and attributes on the page, and the cart total from the site's
 * own cart API (the guest cart id and secret that the storefront keeps in localStorage). Used by the runtime when an
 * event fires and by the editor's test preview. Never throws; a missing fact is null.
 */
import type { TrackingEventDef } from './events'
import { resolveTagValue, type ResolvedValue, type ValueContext } from './valueResolve'

/** The storefront's guest cart reference, as CartContext writes it. */
export const CART_STORAGE_KEY = 'gracengatsby-cart'

/** Where a product page prints its price, when the event does not name an element. */
export const PRODUCT_PRICE_SELECTOR = '[data-eg-price], [itemprop="price"]'
/** Where an order confirmation page prints its total, when the event does not name an element. */
export const ORDER_TOTAL_SELECTOR = '[data-eg-order-total], [data-order-total]'
export const QUANTITY_SELECTOR = '[data-eg-quantity], input[name="quantity"]'

const CART_TIMEOUT_MS = 1500

const textOf = (el: Element | null | undefined): string | null => {
  if (!el) return null
  if (el instanceof HTMLInputElement) return el.value || null
  const value = (el.getAttribute('content') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return value || null
}

/** Reads the cart subtotal through the site's cart API. Subtotals are stored in minor units (cents). */
export async function fetchCartTotal(win: Window): Promise<{ amount: number; currency: string | null } | null> {
  try {
    const raw = win.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return null
    const ref = JSON.parse(raw) as { id?: unknown; secret?: unknown }
    if (typeof ref.id !== 'number' || typeof ref.secret !== 'string') return null
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? win.setTimeout(() => controller.abort(), CART_TIMEOUT_MS) : 0
    try {
      const response = await win.fetch(`/api/carts/${ref.id}?secret=${encodeURIComponent(ref.secret)}&depth=0`, {
        credentials: 'same-origin',
        signal: controller?.signal,
      })
      if (!response.ok) return null
      const cart = (await response.json()) as { subtotal?: unknown; currency?: unknown }
      if (typeof cart.subtotal !== 'number' || !Number.isFinite(cart.subtotal) || cart.subtotal < 0) return null
      return { amount: cart.subtotal / 100, currency: typeof cart.currency === 'string' ? cart.currency : null }
    } finally {
      win.clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/** The page facts one event needs at fire time. The cart is fetched only for the cart source. */
export async function gatherValueContext(
  win: Window,
  def: Pick<TrackingEventDef, 'valueSource' | 'valueSelector' | 'valueRef'>,
  clicked: Element | null,
  siteCurrency: string | null,
): Promise<ValueContext> {
  const doc = win.document
  const named = def.valueSelector ? safeQuery(doc, def.valueSelector) : null
  const target = named ?? clicked
  const ctx: ValueContext = {
    siteCurrency,
    elementText: textOf(target),
    elementAttr: (name) => target?.getAttribute(name) ?? null,
    productPriceText: textOf(safeQuery(doc, PRODUCT_PRICE_SELECTOR)),
    orderTotalText: textOf(safeQuery(doc, ORDER_TOTAL_SELECTOR)),
    quantity: quantityOf(doc),
    dataLayer: (name) => readDataLayer(win, name),
  }
  if (def.valueSource === 'cartTotal') ctx.cart = await fetchCartTotal(win)
  return ctx
}

/** The resolved value and currency for one event firing. */
export async function valueForFiring(
  win: Window,
  def: TrackingEventDef,
  clicked: Element | null,
  siteCurrency: string | null,
): Promise<ResolvedValue> {
  const ctx = await gatherValueContext(win, def, clicked, siteCurrency)
  return resolveTagValue(def, ctx)
}

function safeQuery(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

function quantityOf(doc: Document): number | null {
  const el = safeQuery(doc, QUANTITY_SELECTOR)
  const n = Number(textOf(el))
  return Number.isInteger(n) && n > 0 ? n : null
}

function readDataLayer(win: Window, name: string): unknown {
  if (!/^[A-Za-z_][\w.]{0,79}$/.test(name)) return undefined
  // Only top-level values in the data layer's latest pushes, read by name. Nested paths are read with dots.
  const layer = (win as unknown as { dataLayer?: unknown[] }).dataLayer
  if (!Array.isArray(layer)) return undefined
  for (let i = layer.length - 1; i >= 0; i--) {
    const entry = layer[i] as Record<string, unknown> | null
    if (!entry || typeof entry !== 'object') continue
    const value = name.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), entry)
    if (value !== undefined) return value
  }
  return undefined
}
