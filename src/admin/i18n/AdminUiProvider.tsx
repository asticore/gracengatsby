'use client'

/**
 * Carries the admin's resolved language to client components.
 *
 * RootLayout resolves the locale on the server (see serverUi.ts) and passes
 * the dictionary down once. Client components read it with `useAdminT()`.
 * The provider wraps the sign-in screen too, so the login form is translated
 * before anyone has signed in.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { translateWith, type UiDictionary, type UiStringKey, type UiStringVars } from '@/features/uiStrings'

type AdminUiValue = {
  locale: string
  dir: 'ltr' | 'rtl'
  dict: Partial<UiDictionary>
}

const AdminUiContext = createContext<AdminUiValue>({ locale: 'en', dir: 'ltr', dict: {} })

export function AdminUiProvider({
  locale,
  dir,
  dict,
  children,
}: AdminUiValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, dir, dict }), [locale, dir, dict])
  return <AdminUiContext.Provider value={value}>{children}</AdminUiContext.Provider>
}

/**
 * `t('common.save')` for the signed-in admin's language, or `t('list.total', { total: 5 })`
 * to fill `{name}` placeholders. English when no provider is mounted.
 */
export function useAdminT(): (key: UiStringKey, vars?: UiStringVars) => string {
  const { dict } = useContext(AdminUiContext)
  return useMemo(() => (key: UiStringKey, vars?: UiStringVars) => translateWith(dict, key, vars), [dict])
}

export function useAdminUi(): { locale: string; dir: 'ltr' | 'rtl' } {
  const { locale, dir } = useContext(AdminUiContext)
  return { locale, dir }
}
