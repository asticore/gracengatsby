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
 *    branding it is re-exported under a neutral one (`Engine`, `EngineRequest`,
 *    `richTextEditor`, `shopPlugin`, `ShopProvider`). A vendor-named alias may
 *    exist alongside one temporarily so a specifier repoint can land as a
 *    mechanical, zero-risk change - see ./editor.ts, ./commerce.ts and
 *    ./commerce/react.ts - but each is deprecated and removed once call sites
 *    move to the neutral name, as happened here for `Payload`/`PayloadRequest`.
 * 3. Anything added here should be shaped the way WE want to consume it, not
 *    mirrored from the vendor for its own sake - this is the contract our own
 *    implementation has to satisfy later, so it is worth getting right now.
 *
 * Subsystem modules: ./db, ./editor, ./editor/react, ./ui, ./storage,
 * ./commerce*, ./next/*, ./shared.
 *
 * STAGE 6e (this cutover): `getEngine()`/`Engine` are now this app's own
 * implementation (`src/localapi/engine.ts`'s `createEngine()`/`Engine`)
 * instead of real Payload's `getPayload()`/`Payload`. Every real call site
 * already goes through this seam (rule 1 above), so no other file changed -
 * `getEngine()`'s callers keep awaiting a `Promise<Engine>` exactly as before
 * (see `createEngine()`'s own header for why wrapping a synchronous factory
 * in an async function is a safe no-op for every existing `await getEngine()`
 * call site).
 *
 * `EngineRequest` deliberately KEEPS meaning real Payload's own
 * `PayloadRequest`, unlike `Engine` - confirmed by grepping every real
 * consumer: all of them type a hook, `Access` function, custom Endpoint
 * handler, or admin-view helper's `req` parameter, and every one of those is
 * invoked by real Payload's own still-running hook/access/endpoint/admin
 * machinery (config-authoring is out of scope for this cutover, same as
 * `Access`/`CollectionConfig`/`Field` below) - none of them is a caller
 * building a request to hand INTO our own `createEngine()`'s methods (that
 * internal shape is `src/localapi/engine.ts`'s own `EngineReqLike`, used only
 * by that module's `toLocalReq()`, never exposed through this seam). Only the
 * client type itself (`Engine`) needed to change.
 *
 * The config-authoring types below (`Access`, `CollectionConfig`, `Field`,
 * hooks, ...) still come from the real `payload` package, unchanged - this is
 * deliberately out of scope for this cutover (a separately scoped future
 * concern, tracked in the plan doc). The real Payload instance those types
 * configure (`engage.config.ts`'s `buildConfig()` output) still exists and
 * still powers `/admin` and the REST/GraphQL API, neither of which is cut over
 * yet - only this app's own Local API usage (everything that calls
 * `getEngine()`) changes here.
 */

import { createEngine, type Engine as LocalEngine } from '@/localapi/engine'

export { buildConfig } from 'payload'

/* -------------------------------------------------------------------------- */
/* Core types                                                                  */
/* -------------------------------------------------------------------------- */

/** An initialised engine client. */
export type Engine = LocalEngine
/** The request object handed to hooks, access rules and endpoints - real Payload's own type, see this file's header. */
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
  Sort,
  TextFieldClientProps,
  TypedUser,
  Where,
} from 'payload'

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
 * This is the seam's most important export: it now returns this app's own
 * `createEngine()` (see this file's header, "STAGE 6e") instead of real
 * Payload's `getPayload()` - the from-scratch replacement built and proven
 * across Stages 1-6d.
 */
export const getEngine = async (): Promise<Engine> => createEngine()
