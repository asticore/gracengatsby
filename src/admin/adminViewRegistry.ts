/**
 * Server-only admin component registry: whole-screen views and the sidebar
 * nav/chrome components `engage.config.ts`'s `admin.components.*` originally
 * pointed real Payload's generated importMap at.
 *
 * Deliberately separate from `./componentRegistry.ts` (field-level overrides
 * only) - see that file's own header for why: everything imported here
 * (directly or transitively) is free to touch the real engine/database,
 * because the ONLY consumer of this module is `./views/RootPage.tsx`, a
 * server component. Nothing in this file may be imported from a `'use
 * client'` file (`FieldRenderer.tsx` and everything under it).
 */

import { AdminNav } from '@/components/admin/nav/AdminNav'
import { ExtensionDomSafetyProvider } from '@/components/admin/ExtensionDomSafety'
import { AsticoreIcon } from '@/components/branding/AsticoreIcon'
import { AsticoreLogo } from '@/components/branding/AsticoreLogo'
import { Dashboard } from '@/views/dashboard/Dashboard'
import { TranslationsView } from '@/features/multilingual/views/TranslationsView'
import { DatabaseView } from '@/features/cleanup/DatabaseView'
import { ABResultsView } from '@/features/abTesting/components/ABResultsView'
import { VisualEditorView } from '@/views/VisualEditor'

// Kept for parity with what `engage.config.ts`'s `admin.components` block
// still declares (Nav/providers/graphics overrides) even though nothing yet
// resolves them dynamically - AdminNav is used directly by RootLayout.tsx,
// not looked up by string, and Icon/Logo/providers have no runtime consumer
// of their own yet (a real gap, tracked in the plan doc, not something this
// registry split changes).
export { AdminNav, ExtensionDomSafetyProvider, AsticoreIcon, AsticoreLogo }

export const CUSTOM_ADMIN_VIEWS = [
  {
    key: 'dashboard',
    Component: Dashboard,
    path: '/',
  },
  {
    key: 'translations',
    Component: TranslationsView,
    path: '/translations',
    meta: {
      title: 'Translations',
      description: 'Write every translation in one table.',
    },
  },
  {
    key: 'database',
    Component: DatabaseView,
    path: '/database',
    meta: {
      title: 'Database',
      description: 'Per-feature table usage and cleanup.',
    },
  },
  {
    key: 'abTestResults',
    Component: ABResultsView,
    path: '/ab-test-results',
    meta: {
      title: 'A/B test results',
      description: 'Per-variant visitors, conversions and confidence.',
    },
  },
  {
    key: 'visualEditor',
    Component: VisualEditorView,
    path: '/visual-editor/:mode/:slug/:id?',
    meta: {
      title: 'Visual Editor',
      description: 'Edit a page layout visually.',
    },
  },
] as const
