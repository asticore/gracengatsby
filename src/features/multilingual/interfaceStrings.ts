/**
 * Storefront interface strings, as the translation screen lists them.
 *
 * Derived from the reference table (src/features/uiStrings/keys.ts): every
 * `store.*` key is listed here with its English text and a translator context.
 * Translations live in the reference table's dictionaries and the owner's
 * overrides in Languages settings, so this list is a read-only view of them.
 */

import { UI_STRING_SOURCE } from '@/features/uiStrings/keys'

export type InterfaceStringDef = {
  /** Stable key. Changing it orphans existing translations, so don't. */
  key: string
  /** Source-language text. */
  en: string
  /** Shown to the translator so an ambiguous word can be translated correctly. */
  context: string
  group: string
}

const CONTEXT: Record<string, string> = {
  'store.addToCart': 'Button on a product. Verb.',
  'store.adding': 'Button text while the add-to-cart request is in flight.',
  'store.addedToCart': 'Shown after an item is added.',
  'store.viewCart': 'Link to the cart after adding an item.',
  'store.outOfStock': 'Shown in place of the add-to-cart button.',
  'store.sale': 'Badge on a discounted product.',
  'store.cart': 'Cart heading and link.',
  'store.emptyCart': 'Shown on the cart page when nothing has been added.',
  'store.continueShopping': 'Link back to the product listing.',
  'store.subtotal': 'Cart total before shipping and tax.',
  'store.total': 'Final amount payable.',
  'store.quantity': 'Label on the quantity input.',
  'store.remove': 'Removes one line from the cart.',
  'store.checkout': 'Button that starts payment.',
  'store.readMore': 'Link at the end of a post excerpt.',
  'store.search': 'Search button and label.',
  'store.previous': 'Pagination: previous page.',
  'store.next': 'Pagination: next page.',
  'store.wishlist': 'Saved-for-later list.',
  'store.compare': 'Compare products.',
  'store.shipping': 'Shipping cost label.',
  'store.tax': 'Tax label in totals.',
  'store.orderConfirmed': 'Heading on the post-payment page.',
}

export const INTERFACE_STRINGS: InterfaceStringDef[] = Object.keys(CONTEXT).map((key) => ({
  key,
  en: UI_STRING_SOURCE[key as keyof typeof UI_STRING_SOURCE] ?? key,
  context: CONTEXT[key] ?? '',
  group: 'Storefront',
}))

export const INTERFACE_SOURCE_ID = 'ui'

const BY_KEY = new Map(INTERFACE_STRINGS.map((entry) => [entry.key, entry]))

export const interfaceSourceText = (key: string): string => BY_KEY.get(key)?.en ?? key

export const INTERFACE_GROUPS: string[] = [...new Set(INTERFACE_STRINGS.map((entry) => entry.group))]
