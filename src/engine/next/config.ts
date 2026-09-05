/**
 * Engine seam: the Next build-config wrapper.
 *
 * The engine injects its own webpack/turbopack aliases and transpile rules
 * through this wrapper, which is why next.config.ts cannot simply be a plain
 * Next config. Imported from the repo root rather than from src/, so it is
 * reached by relative path there instead of the `@/` alias.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 */

export { withPayload as withEngine } from '@payloadcms/next/withPayload'
