/**
 * Engine seam: media storage.
 *
 * One symbol, wiring uploads to the R2 bucket. R2 is reached through a plain
 * binding, so this is one of the easier subsystems to take over.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export { r2Storage } from '@payloadcms/storage-r2'
