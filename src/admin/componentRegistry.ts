/**
 * Hand-written replacement for the CLI-generated src/app/(engage)/admin/importMap.js
 * - FIELD-level component overrides only.
 *
 * Maps identifier strings (in the format '<module-path>#<ExportName>') to their actual
 * React components. These identifiers are referenced in field configs via their own
 * `admin.components.Field` override string, and resolved here by `FieldRenderer.tsx`
 * (`./fields/FieldRenderer.tsx`) - the ONLY caller of `resolveComponent`.
 *
 * That caller is a CLIENT component (`'use client'`), so this module - and everything
 * it imports - ends up in the browser bundle. It must therefore hold ONLY client-safe
 * field widgets, never a server admin view (Dashboard/TranslationsView/DatabaseView/
 * ABResultsView all read the database directly) or anything else that pulls in real
 * `engine`'s own Node-only internals (pino-pretty, migrations, `node:assert`, ...).
 * That split used to be a single file with everything in it, which - once EditForm.tsx
 * gave FieldRenderer a real path into an actual page's build graph - broke the client
 * bundle outright (`ABResultsView` -> `@/lib/engine` -> real `engine` -> Node-only
 * deps, none of which webpack can put in a browser bundle). See `./adminViewRegistry.ts`
 * for the server-only counterpart (`CUSTOM_ADMIN_VIEWS`, consumed only by the server
 * component `./views/RootPage.tsx`) - nothing in this file should ever import from it,
 * or from any other admin view/screen component that itself reads the engine.
 */

import type { ComponentType } from 'react'
import { SlugComponent } from '@/fields/slug/SlugComponent'
import { OpenVisualEditorButton } from '@/fields/visualEditor/OpenVisualEditorButton'
import { CustomFieldsPanel } from '@/fields/customFields/CustomFieldsPanel'
import { FieldGroupBuilderField } from '@/features/customFields/admin/FieldGroupBuilderField'
import { FieldGroupLocationField } from '@/features/customFields/admin/FieldGroupLocationField'
import { BackupPanel } from '@/features/backups/admin/BackupPanel'
import { SendTestEmailButton } from '@/features/email/admin/SendTestEmailButton'
import { ParentPicker } from '@/fields/parentPicker/ParentPicker'
import { PriceInput } from '@/features/ecommerce/admin/PriceInput'
import { CloudflarePurgeOnPublishField } from '@/admin/components/CloudflarePurgeOnPublishField'
import { ColorPickerField } from '@/admin/components/ColorPickerField'
import { UserPermissionOverridesField } from '@/admin/components/UserPermissionOverridesField'
import { FontPickerField } from '@/admin/components/FontPickerField'
import { FontsManagerField } from '@/admin/components/FontsManagerField'
import { MediaFocalPointField } from '@/features/media/admin/MediaFocalPointField'
import { MediaCropField } from '@/features/media/admin/MediaCropField'
import { MediaEditPanel } from '@/features/media/admin/MediaEditPanel'
import { SiteFilesField } from '@/features/seo/admin/SiteFilesField'

export const COMPONENT_REGISTRY: Record<string, ComponentType<any>> = {
  '@/fields/slug/SlugComponent#SlugComponent': SlugComponent,
  '@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton': OpenVisualEditorButton,
  '@/fields/customFields/CustomFieldsPanel#CustomFieldsPanel': CustomFieldsPanel,
  '@/features/customFields/admin/FieldGroupBuilderField#FieldGroupBuilderField': FieldGroupBuilderField,
  '@/features/customFields/admin/FieldGroupLocationField#FieldGroupLocationField': FieldGroupLocationField,
  '@/features/backups/admin/BackupPanel#BackupPanel': BackupPanel,
  '@/features/email/admin/SendTestEmailButton#SendTestEmailButton': SendTestEmailButton,
  '@/features/ecommerce/admin/PriceInput#PriceInput': PriceInput,
  '@/fields/parentPicker/ParentPicker#ParentPicker': ParentPicker,
  '@/admin/components/CloudflarePurgeOnPublishField#CloudflarePurgeOnPublishField': CloudflarePurgeOnPublishField,
  '@/admin/components/ColorPickerField#ColorPickerField': ColorPickerField,
  '@/admin/components/UserPermissionOverridesField#UserPermissionOverridesField': UserPermissionOverridesField,
  '@/admin/components/FontPickerField#FontPickerField': FontPickerField,
  '@/admin/components/FontsManagerField#FontsManagerField': FontsManagerField,
  '@/features/media/admin/MediaFocalPointField#MediaFocalPointField': MediaFocalPointField,
  '@/features/media/admin/MediaCropField#MediaCropField': MediaCropField,
  '@/features/media/admin/MediaEditPanel#MediaEditPanel': MediaEditPanel,
  '@/features/seo/admin/SiteFilesField#SiteFilesField': SiteFilesField,
}

export function resolveComponent(path: string | undefined | null): ComponentType<any> | undefined {
  if (!path) return undefined
  return COMPONENT_REGISTRY[path]
}