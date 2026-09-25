/**
 * Hand-written replacement for the CLI-generated src/app/(engage)/admin/importMap.js
 *
 * Maps identifier strings (in the format '<module-path>#<ExportName>') to their actual
 * React components. These identifiers are referenced in collection/global configs via their
 * `admin.components.*` fields.
 *
 * The `resolveComponent` function mirrors how the generated importMap was consumed,
 * providing a drop-in replacement once the admin route stops importing the generated file.
 */

import type { ComponentType } from 'react'
import { SlugComponent } from '@/fields/slug/SlugComponent'
import { OpenVisualEditorButton } from '@/fields/visualEditor/OpenVisualEditorButton'
import { CustomFieldsPanel } from '@/fields/customFields/CustomFieldsPanel'
import { BackupPanel } from '@/features/backups/admin/BackupPanel'
import { SendTestEmailButton } from '@/features/email/admin/SendTestEmailButton'
import { AdminNav } from '@/components/admin/nav/AdminNav'
import { ExtensionDomSafetyProvider } from '@/components/admin/ExtensionDomSafety'
import { AsticoreIcon } from '@/components/branding/AsticoreIcon'
import { AsticoreLogo } from '@/components/branding/AsticoreLogo'
import { Dashboard } from '@/views/dashboard/Dashboard'
import { TranslationsView } from '@/features/multilingual/views/TranslationsView'
import { DatabaseView } from '@/features/cleanup/DatabaseView'
import { ABResultsView } from '@/features/abTesting/components/ABResultsView'
import { VisualEditorView } from '@/views/VisualEditor'

export const COMPONENT_REGISTRY: Record<string, ComponentType<any>> = {
  '@/fields/slug/SlugComponent#SlugComponent': SlugComponent,
  '@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton': OpenVisualEditorButton,
  '@/fields/customFields/CustomFieldsPanel#CustomFieldsPanel': CustomFieldsPanel,
  '@/features/backups/admin/BackupPanel#BackupPanel': BackupPanel,
  '@/features/email/admin/SendTestEmailButton#SendTestEmailButton': SendTestEmailButton,
  '@/components/admin/nav/AdminNav#AdminNav': AdminNav,
  '@/components/admin/ExtensionDomSafety#ExtensionDomSafetyProvider': ExtensionDomSafetyProvider,
  '@/components/branding/AsticoreIcon#AsticoreIcon': AsticoreIcon,
  '@/components/branding/AsticoreLogo#AsticoreLogo': AsticoreLogo,
  '@/views/dashboard/Dashboard#Dashboard': Dashboard,
  '@/features/multilingual/views/TranslationsView#TranslationsView': TranslationsView,
  '@/features/cleanup/DatabaseView#DatabaseView': DatabaseView,
  '@/features/abTesting/components/ABResultsView#ABResultsView': ABResultsView,
  '@/views/VisualEditor#VisualEditorView': VisualEditorView,
}

export function resolveComponent(path: string | undefined | null): ComponentType<any> | undefined {
  if (!path) return undefined
  return COMPONENT_REGISTRY[path]
}

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
