/**
 * Engine seam: the admin page renderer and its metadata generator.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 *
 * STAGE 11 (Admin UI rebuild): from-scratch implementations
 * (`src/admin/views/RootPage.tsx`) replace the vendor's own
 * `@payloadcms/next/views` exports - see that file's own header for the full
 * routing table and design.
 */

export { NotFoundPage, RootPage, generatePageMetadata } from '@/admin/views/RootPage'
