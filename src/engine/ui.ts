/**
 * Engine seam: admin UI components and field hooks.
 *
 * Stage 11 (Admin UI rebuild, option 1 - full custom admin): this file used
 * to re-export the vendor's own client components from `@payloadcms/ui`. It
 * now re-exports our own from-scratch replacements instead, under
 * `src/admin/{context,ui}`. Every one of them was written to match the exact
 * call signature the existing custom field/nav components already depend on
 * (SlugComponent.tsx, OpenVisualEditorButton.tsx, CustomFieldsPanel.tsx,
 * BackupPanel.tsx, SendTestEmailButton.tsx, AdminNav.tsx, AdminNavClient.tsx,
 * SettingsRefresh.tsx), so none of those consumer files needed to change.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 * See claude/payload-removal-plan.md, "Admin UI rebuild (Stage 11)" for the
 * full architecture.
 */

export { FieldLabel } from '@/admin/ui/FieldLabel'
export { Hamburger } from '@/admin/ui/Hamburger'
export { Link } from '@/admin/ui/Link'
export { Logout } from '@/admin/ui/Logout'
export { NavGroup } from '@/admin/ui/NavGroup'
export { TextInput } from '@/admin/ui/TextInput'

export { useDocumentEvents } from '@/admin/context/DocumentEventsContext'
export { useDocumentInfo } from '@/admin/context/DocumentInfoContext'
export { useField, useFormFields, useFormModified } from '@/admin/context/FormContext'
export { useNav } from '@/admin/context/NavContext'
