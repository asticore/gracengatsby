import type { UiStringKey } from './keys'

/**
 * Customer-portal keys are stored as `portal.<name>` in the reference table.
 * This maps the portal's own short names onto those keys, so the portal's
 * callers never see the prefix.
 */
export type PortalStringKey =
  Extract<UiStringKey, `portal.${string}`> extends `portal.${infer Rest}` ? Rest : never

export function portalKey(name: PortalStringKey): `portal.${PortalStringKey}` {
  return `portal.${name}`
}
