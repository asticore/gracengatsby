'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `useDocumentInfo`.
 *
 * Backs OpenVisualEditorButton.tsx and CustomFieldsPanel.tsx, both of which
 * destructure `{id, collectionSlug, globalSlug}`. Provided once per
 * create/edit view, wrapping the same tree as FormProvider.
 */

import React, { createContext, useContext } from 'react'

export type DocumentInfoValue = {
  id?: number | string
  collectionSlug?: string
  globalSlug?: string
}

const DocumentInfoContext = createContext<DocumentInfoValue>({})

export const DocumentInfoProvider: React.FC<{
  children: React.ReactNode
  value: DocumentInfoValue
}> = ({ children, value }) => <DocumentInfoContext.Provider value={value}>{children}</DocumentInfoContext.Provider>

export function useDocumentInfo(): DocumentInfoValue {
  return useContext(DocumentInfoContext)
}
