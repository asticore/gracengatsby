/**
 * Shop-wide switches from the `shop-extra-settings` global (server only). Read once per request by the caller.
 * A missing row or value means the default, so a fresh install behaves as before.
 */

type Engine = { findGlobal(a: unknown): Promise<unknown> }

/** The pure rule: pre-orders are on unless the saved switch is explicitly off. */
export const preordersEnabledFrom = (doc: unknown): boolean => (doc as { preordersEnabled?: unknown } | null | undefined)?.preordersEnabled !== false

/** Whether pre-orders are on across the shop. Never throws: an unreadable global counts as on (the default). */
export async function loadPreordersEnabled(engine: Engine): Promise<boolean> {
  try {
    return preordersEnabledFrom(await engine.findGlobal({ slug: 'shop-extra-settings', depth: 0, overrideAccess: true }))
  } catch {
    return true
  }
}
