/*
 * The ready-made events the tag editor offers, with the friendly names an admin sees. Each maps to one standard
 * event (or a custom name) and a default trigger. Labels are uiStrings keys (`tracking.tags.option.*`), so the
 * editor translates them; the default event name is the English one saved on the row.
 */
import type { StandardEvent, TriggerType } from '../events'
import type { TagOption } from './suggest'

export type TagOptionDef = {
  option: TagOption
  platformEvent: StandardEvent
  trigger: Extract<TriggerType, 'click' | 'submit'>
  defaultName: string
  labelKey: `tracking.tags.option.${TagOption}`
}

export const TAG_OPTIONS: readonly TagOptionDef[] = [
  { option: 'addToCart', platformEvent: 'AddToCart', trigger: 'click', defaultName: 'Add to cart', labelKey: 'tracking.tags.option.addToCart' },
  { option: 'buyNow', platformEvent: 'Purchase', trigger: 'click', defaultName: 'Buy now', labelKey: 'tracking.tags.option.buyNow' },
  { option: 'checkoutStarted', platformEvent: 'Custom', trigger: 'click', defaultName: 'Checkout started', labelKey: 'tracking.tags.option.checkoutStarted' },
  { option: 'signUp', platformEvent: 'CompleteRegistration', trigger: 'click', defaultName: 'Sign up', labelKey: 'tracking.tags.option.signUp' },
  { option: 'lead', platformEvent: 'Lead', trigger: 'submit', defaultName: 'Lead form submitted', labelKey: 'tracking.tags.option.lead' },
  { option: 'bookNow', platformEvent: 'Custom', trigger: 'click', defaultName: 'Book now', labelKey: 'tracking.tags.option.bookNow' },
  { option: 'search', platformEvent: 'Search', trigger: 'submit', defaultName: 'Search', labelKey: 'tracking.tags.option.search' },
  { option: 'viewProduct', platformEvent: 'ViewContent', trigger: 'click', defaultName: 'View product', labelKey: 'tracking.tags.option.viewProduct' },
  { option: 'download', platformEvent: 'Custom', trigger: 'click', defaultName: 'Download', labelKey: 'tracking.tags.option.download' },
  { option: 'phone', platformEvent: 'Contact', trigger: 'click', defaultName: 'Phone click', labelKey: 'tracking.tags.option.phone' },
  { option: 'email', platformEvent: 'Contact', trigger: 'click', defaultName: 'Email click', labelKey: 'tracking.tags.option.email' },
  { option: 'newsletter', platformEvent: 'Lead', trigger: 'submit', defaultName: 'Newsletter signup', labelKey: 'tracking.tags.option.newsletter' },
  { option: 'viewCart', platformEvent: 'Custom', trigger: 'click', defaultName: 'View cart', labelKey: 'tracking.tags.option.viewCart' },
  { option: 'custom', platformEvent: 'Custom', trigger: 'click', defaultName: 'Custom event', labelKey: 'tracking.tags.option.custom' },
]

export const tagOptionDef = (option: TagOption): TagOptionDef => TAG_OPTIONS.find((o) => o.option === option) ?? TAG_OPTIONS[TAG_OPTIONS.length - 1]!

/** The option whose standard event and default name match a saved row, so editing shows the right choice. */
export function optionForRow(platformEvent: string, name: string): TagOption {
  const byName = TAG_OPTIONS.find((o) => o.defaultName.toLowerCase() === name.trim().toLowerCase())
  if (byName) return byName.option
  const byEvent = TAG_OPTIONS.find((o) => o.platformEvent === platformEvent && o.platformEvent !== 'Custom')
  return byEvent?.option ?? 'custom'
}
