/**
 * What the browser may load, decided from the visitor's consent. Pure, so the
 * gate can be tested without a DOM: the runtime calls planScripts() and does
 * nothing at all when it returns an empty list.
 */

import type { ConsentChoices } from '@/features/consent/consent'

import type { PublicConfig } from './builders'

export const GPT_URL = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'
export const ADSENSE_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
export const APSTAG_URL = 'https://c.amazon-adsystem.com/aax2/apstag.js'

/** Advertising needs the marketing category. Nothing else grants it. */
export const adsAllowed = (choices: ConsentChoices): boolean => choices.marketing === true

export type ScriptPlan = { id: string; src: string }

/** Whether GDPR rules apply to this visitor, given the mode and whether the consent system says opt-in. */
export const gdprApplies = (mode: PublicConfig['privacy']['gdpr'], optInRegion: boolean): boolean => (mode === 'always' ? true : mode === 'never' ? false : optInRegion)

/** Which kinds of slot are on the page right now. Omitted means "assume both". */
export type SlotNeeds = { gam: boolean; adsense: boolean }

/**
 * The scripts to add, in order, for the page's config and choices.
 * Empty when marketing is not granted, when the page is marked "no ads", or
 * when the config is missing - so with no consent no script is added and no
 * request is made.
 */
export function planScripts(config: PublicConfig | null, choices: ConsentChoices, options: { noAds?: boolean; needs?: SlotNeeds } = {}): ScriptPlan[] {
  if (!config || options.noAds || !adsAllowed(choices)) return []
  const needs = options.needs ?? { gam: true, adsense: true }
  const plan: ScriptPlan[] = []
  if (config.gam && needs.gam) {
    if (config.prebid) plan.push({ id: 'engage-ads-prebid', src: config.prebid.url })
    if (config.tam) plan.push({ id: 'engage-ads-apstag', src: APSTAG_URL })
    plan.push({ id: 'engage-ads-gpt', src: GPT_URL })
  }
  // The AdSense script also switches on auto ads for the whole page, so it is
  // only added when auto ads were asked for or a manual AdSense unit is on the page.
  if (config.adsense && (needs.adsense || config.adsense.auto)) {
    plan.push({ id: 'engage-ads-adsense', src: `${ADSENSE_URL}?client=${encodeURIComponent(config.adsense.client)}` })
  }
  return plan
}
