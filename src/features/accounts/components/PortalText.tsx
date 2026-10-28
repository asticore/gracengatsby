'use client'

import React, { createContext, useContext } from 'react'

import { portalKey, type PortalStringKey } from '@/features/uiStrings/portalAdapter'
import { UI_STRING_SOURCE } from '@/features/uiStrings/keys'
import { interpolate, type UiStringVars } from '@/features/uiStrings/t'

/**
 * Client-side access to the portal's translated strings.
 *
 * The account shell reads the strings for the visitor's language on the server
 * and passes them down here once, so client components (forms, buttons, the
 * lesson's complete toggle) show the same language as the server-rendered page.
 * A key that was not passed falls back to English.
 */

const PortalTextContext = createContext<Record<string, string>>({})

export const PortalTextProvider: React.FC<{ strings: Record<string, string>; children: React.ReactNode }> = ({
  strings,
  children,
}) => <PortalTextContext.Provider value={strings}>{children}</PortalTextContext.Provider>

export function usePortalText(): (key: PortalStringKey, vars?: UiStringVars) => string {
  const strings = useContext(PortalTextContext)
  return (key, vars) => {
    const full = portalKey(key)
    return interpolate(strings[full] ?? UI_STRING_SOURCE[full], vars)
  }
}
