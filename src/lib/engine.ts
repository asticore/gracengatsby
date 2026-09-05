/**
 * Re-export shim for the engine client accessor.
 *
 * `getEngine` now lives in the engine seam (src/engine/index.ts) alongside the
 * rest of the vendor boundary. This file stays because ~40 modules import it
 * from here, and the seam repoint was kept to specifier changes only so it
 * could land as a zero-risk mechanical commit.
 *
 * Not deprecated - `@/lib/engine` is a perfectly good name for this and the
 * indirection costs nothing. Import from either.
 */

export { getEngine } from '@/engine'
export type { Engine } from '@/engine'
