'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `useDocumentEvents`.
 *
 * Backs SettingsRefresh.tsx, which reads `mostRecentUpdate?.entitySlug` /
 * `.updatedAt` to know a save just happened. Mounted once, high in the admin
 * tree (RootLayout), so it is a sibling of both the nav (which reads it) and
 * whatever edit view just saved (which reports to it) - a save on any screen
 * is visible to every screen without a full page reload.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type DocumentEvent = {
  entitySlug: string
  updatedAt: string
}

type DocumentEventsContextValue = {
  mostRecentUpdate?: DocumentEvent
  reportUpdate: (event: DocumentEvent) => void
}

const DocumentEventsContext = createContext<DocumentEventsContextValue | null>(null)

export const DocumentEventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mostRecentUpdate, setMostRecentUpdate] = useState<DocumentEvent | undefined>(undefined)

  const reportUpdate = useCallback((event: DocumentEvent) => setMostRecentUpdate(event), [])

  const value = useMemo(() => ({ mostRecentUpdate, reportUpdate }), [mostRecentUpdate, reportUpdate])

  return <DocumentEventsContext.Provider value={value}>{children}</DocumentEventsContext.Provider>
}

export function useDocumentEvents(): DocumentEventsContextValue {
  const ctx = useContext(DocumentEventsContext)
  if (!ctx) throw new Error('useDocumentEvents must be used within a DocumentEventsProvider')
  return ctx
}
