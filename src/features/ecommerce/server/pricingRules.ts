/**
 * Reads the add-on and pricing rule switches and the rules themselves from the `shop-extra-settings` global
 * (server only). A missing value means the default: add-ons on, rules on, no rules. An unreadable global
 * never throws; it falls back to the defaults, and with no rules nothing is discounted.
 */

import { normalisePricingRules, type PricingRule } from '../lib/pricingRules'

type Engine = { findGlobal(a: unknown): Promise<unknown> }

export type ShopRulesConfig = { addOnsOn: boolean; rulesOn: boolean; rules: PricingRule[] }

/** The pure reading of the global: add-ons are on unless switched off, and so are the rules. */
export function shopRulesConfigFrom(doc: unknown): ShopRulesConfig {
  const d = (doc ?? {}) as { addOnsEnabled?: unknown; pricingRulesEnabled?: unknown; pricingRules?: unknown }
  return {
    addOnsOn: d.addOnsEnabled !== false,
    rulesOn: d.pricingRulesEnabled !== false,
    rules: normalisePricingRules(d.pricingRules),
  }
}

/** One read of the shop switches and rules for a request. Never throws. */
export async function loadShopRulesConfig(engine: Engine): Promise<ShopRulesConfig> {
  try {
    return shopRulesConfigFrom(await engine.findGlobal({ slug: 'shop-extra-settings', depth: 0, overrideAccess: true }))
  } catch {
    return { addOnsOn: true, rulesOn: true, rules: [] }
  }
}
