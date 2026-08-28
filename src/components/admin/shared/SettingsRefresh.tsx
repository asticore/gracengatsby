'use client'

import React from 'react'
import { useDocumentEvents } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

/**
 * Keeps the sidebar and dashboard honest the moment a feature is toggled.
 *
 * Both are server components that read the feature flags once per request, so
 * saving Site Settings changed the database but left the rendered menu alone
 * until the next navigation. The engine reports every successful document save
 * to `useDocumentEvents`, so subscribing to that and asking Next to re-fetch
 * the current route's server components turns the save into an immediate
 * re-render - no manual reload.
 *
 * Mounted from the nav so it lives on every admin screen, including the Site
 * Settings screen itself, and survives the refresh it triggers.
 */
export const SettingsRefresh: React.FC = () => {
  const { mostRecentUpdate } = useDocumentEvents()
  const router = useRouter()

  // Only the timestamp matters here: a new one means a fresh save, and
  // depending on the event object itself would re-fire on identity changes.
  const updatedAt = mostRecentUpdate?.entitySlug === 'site-settings' ? mostRecentUpdate.updatedAt : null

  React.useEffect(() => {
    if (!updatedAt) return
    router.refresh()
  }, [router, updatedAt])

  return null
}

export default SettingsRefresh
