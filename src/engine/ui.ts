/**
 * Engine seam: admin UI components and field hooks.
 *
 * These are the vendor's own client components, used by our custom admin
 * views and custom field components. No 'use client' directive here on
 * purpose - each source module declares its own, and a plain re-export
 * preserves that boundary exactly as it is today.
 *
 * This is the largest and last subsystem to replace: it is what renders the
 * portal. Everything our custom admin code needs from it is listed below, and
 * that list is the spec our own component set has to meet.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export {
  FieldLabel,
  Hamburger,
  Link,
  Logout,
  NavGroup,
  TextInput,
  useDocumentEvents,
  useDocumentInfo,
  useField,
  useFormFields,
  useFormModified,
  useNav,
} from '@payloadcms/ui'
