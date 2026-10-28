'use client'

import React, { createContext, useCallback, useContext } from 'react'

import { translateWith, type UiDictionary, type UiStringVars } from '@/features/uiStrings'
import { portalKey, type PortalStringKey } from '@/features/uiStrings/portalAdapter'

/**
 * Hands the portal's translated strings to client components below it.
 *
 * The server shell (AuthShell, AccountShell) loads the dictionary for the
 * visitor's language and passes the plain `portal.*` map down here. Anything
 * rendered outside a provider (the admin login, which shares some of these
 * components) reads English, exactly as before.
 */

type Dictionary = Partial<UiDictionary>

const PortalTextContext = createContext<Dictionary>({})

export const PortalTextProvider: React.FC<{ dictionary: Record<string, string>; children: React.ReactNode }> = ({
  dictionary,
  children,
}) => <PortalTextContext.Provider value={dictionary}>{children}</PortalTextContext.Provider>

/** `const tx = usePortalText(); tx('auth.signIn')`, with `{name}` placeholders via the second argument. */
export function usePortalText(): (key: PortalStringKey, vars?: UiStringVars) => string {
  const dictionary = useContext(PortalTextContext)
  return useCallback(
    (key: PortalStringKey, vars?: UiStringVars) => translateWith(dictionary, portalKey(key), vars),
    [dictionary],
  )
}
