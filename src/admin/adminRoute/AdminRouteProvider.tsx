'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { DEFAULT_ADMIN_PATH, adminHref } from '@/features/security/adminPath'

/**
 * The configured admin root (Security > Admin URL, or ENGAGE_ADMIN_PATH) for the
 * client screens. The server layout reads it once and passes it down, so a
 * client component never hard-codes /admin.
 */
const AdminRouteContext = createContext<string>(DEFAULT_ADMIN_PATH)

export function AdminRouteProvider({ root, children }: { root: string; children: ReactNode }) {
  return <AdminRouteContext.Provider value={root}>{children}</AdminRouteContext.Provider>
}

export const useAdminRoot = (): string => useContext(AdminRouteContext)

/** Builds an admin URL under the configured root: `useAdminHref()('/login')`. */
export const useAdminHref = (): ((path?: string) => string) => {
  const root = useAdminRoot()
  return (path = '') => adminHref(path, root)
}
