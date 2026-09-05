/**
 * The engine seam - the single boundary between this application and the CMS
 * engine underneath it.
 *
 * WHY THIS EXISTS
 *
 * Before this module, 137 of the 376 files in src/ imported the vendor package
 * directly. That made the engine impossible to replace: swapping it meant
 * editing every one of those files at once, so the app could never be moved
 * across in stages and would be unshippable for the whole migration.
 *
 * Everything now imports from `@/engine/*` instead. Each module here mirrors
 * exactly one vendor entry point, so replacing a subsystem means rewriting the
 * body of one file in this directory while its consumers stay untouched. That
 * is what lets the engine be rebuilt one subsystem at a time - data layer,
 * then fields, then API, then auth, then admin UI - with a working site after
 * every step instead of only at the end.
 *
 * THE RULES FOR THIS DIRECTORY
 *
 * 1. This directory is the ONLY place allowed to name the vendor package.
 *    Nothing under src/ outside src/engine/ may import it directly.
 * 2. Exported names are ours, not the vendor's. Where a vendor name leaks its
 *    branding it is re-exported under a neutral one (`Engine`, `EngineRequest`).
 *    The vendor-named aliases below exist only so the repoint could land
 *    without a 94-file rename in the same commit; they are deprecated and get
 *    removed once call sites are migrated to the neutral names.
 * 3. Anything added here should be shaped the way WE want to consume it, not
 *    mirrored from the vendor for its own sake - this is the contract our own
 *    implementation has to satisfy later, so it is worth getting right now.
 *
 * Subsystem modules: ./db, ./editor, ./editor/react, ./ui, ./storage,
 * ./commerce*, ./next/*, ./shared.
 */

import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '@engage-config'

export { buildConfig } from 'payload'

/* -------------------------------------------------------------------------- */
/* Core types                                                                  */
/* -------------------------------------------------------------------------- */

/** An initialised engine client. */
export type Engine = Payload
/** The request object handed to hooks, access rules and endpoints. */
export type { PayloadRequest as EngineRequest } from 'payload'

export type {
  Access,
  AdminViewServerProps,
  Block,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  CollectionSlug,
  Endpoint,
  Field,
  FieldAccess,
  FieldHook,
  GlobalAfterChangeHook,
  GlobalConfig,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
  ServerFunctionClient,
  TextFieldClientProps,
  TypedUser,
  Where,
} from 'payload'

/**
 * Deprecated vendor-named aliases. Kept so the 94-file specifier repoint could
 * land as a mechanical, zero-risk change; call sites move to `Engine` and
 * `EngineRequest` in the follow-up sweep, then these two lines go.
 */
export type { Payload, PayloadRequest } from 'payload'

/* -------------------------------------------------------------------------- */
/* Client accessor                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Returns the initialised engine client for this request.
 *
 * Everything that reads or writes content server-side goes through here -
 * frontend pages, sitemap/robots, the feature-toggle lookups and the block
 * components that fetch their own data.
 *
 * This is the seam's most important export: when the data layer is replaced,
 * this function returns our own client instead, and no caller changes.
 */
export const getEngine = async (): Promise<Engine> => {
  const engineConfig = await config
  return getPayload({ config: engineConfig })
}
