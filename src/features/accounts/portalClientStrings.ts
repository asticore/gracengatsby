import { portalText } from '@/features/multilingual/portalStrings'
import { UI_STRING_SOURCE } from '@/features/uiStrings/keys'
import type { PortalStringKey } from '@/features/uiStrings/portalAdapter'

/** Portal keys read by client components. Everything else is rendered on the server. */
const CLIENT_PREFIXES = ['portal.nav.', 'portal.form.', 'portal.orgs.', 'portal.subscriptions.', 'portal.orders.adding', 'portal.lesson.']

/** The client-side strings for one portal language, keyed by the full `portal.*` name. */
export const portalClientStrings = (locale: string | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const key of Object.keys(UI_STRING_SOURCE)) {
    if (!CLIENT_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    out[key] = portalText(key.slice('portal.'.length) as PortalStringKey, locale)
  }
  return out
}
