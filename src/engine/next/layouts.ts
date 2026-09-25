/**
 * Engine seam: the admin root layout and its server-function bridge.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 *
 * STAGE 11 (Admin UI rebuild): a from-scratch implementation
 * (`src/admin/RootLayout.tsx`) replaces the vendor's own
 * `@payloadcms/next/layouts` exports - see that file's own header for why
 * `handleServerFunctions` is a deliberate throwing stub, not a real
 * reimplementation.
 */

export { RootLayout, handleServerFunctions } from '@/admin/RootLayout'
