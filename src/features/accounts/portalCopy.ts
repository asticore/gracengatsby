import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { loadPortalTexts, type PortalStringKey, type PortalTexts } from '@/features/multilingual/portalStrings'

/**
 * The portal's translated strings for the current visitor, for server code in the
 * account area (screens, shells, metadata, actions).
 */
export const accountTexts = async (): Promise<PortalTexts> => loadPortalTexts(await currentPortalLocale())

/** A page title for `generateMetadata`, in the visitor's language. */
export const accountTitle = async (key: PortalStringKey): Promise<string> => (await accountTexts())(key)
