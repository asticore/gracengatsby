import { UI_STRING_SOURCE, type UiDictionary, type UiStringKey } from '../keys'

type PortalKey = Extract<UiStringKey, `portal.${string}`>

/**
 * Customer-portal strings, held in English in every dictionary.
 *
 * The portal has never been translated, so every locale returns the English
 * text, exactly as it did before the reference table existed. Replace an
 * entry in a locale file when that language is ready. Until then the
 * Interface languages page lists these as missing.
 */
export const PORTAL_ENGLISH: Pick<UiDictionary, PortalKey> = Object.fromEntries(
  Object.entries(UI_STRING_SOURCE).filter(([key]) => key.startsWith('portal.')),
) as Pick<UiDictionary, PortalKey>
