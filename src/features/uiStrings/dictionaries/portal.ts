import { UI_STRING_SOURCE, type UiDictionary, type UiStringKey } from '../keys'

type PortalKey = Extract<UiStringKey, `portal.${string}`>

/**
 * Customer-portal strings. Each locale file overrides these with its own translation;
 * any key a locale has not translated falls back to this English table.
 */
export const PORTAL_ENGLISH: Pick<UiDictionary, PortalKey> = Object.fromEntries(
  Object.entries(UI_STRING_SOURCE).filter(([key]) => key.startsWith('portal.')),
) as Pick<UiDictionary, PortalKey>
