/**
 * REST + GraphQL API removal (Stage 7), sub-step 3: the REST handler layer
 * itself - a hand-rolled, from-scratch replacement for the SUBSET of real
 * The original engine's REST surface this stage puts in scope (see
 * the plan doc's "REST + GraphQL API removal (Stage 7)" section
 * for the full scoping decision): collection list/byID/create/update
 * (byID)/delete (byID)/count, global find/update, and the six core auth
 * endpoints (login/logout/me/refresh-token/forgot-password/reset-password/
 * unlock).
 *
 * NOT YET WIRED into `src/app/(engage)/api/[...slug]/route.ts` - that is the
 * next, separately-verified sub-step (the actual "flip" for this stage,
 * following this project's established build-prove-flip methodology: this
 * module is built and unit-tested standalone first, exactly like every
 * `localapi/*` module before it, then wired in as its own separate,
 * separately-verified step). `handleRestRequest` is the one function a
 * future thin wrapper in that route file will call: it returns a real
 * `Response` for anything in scope, or `null` to signal "not handled here,
 * fall through to the reference engine's REST_GET/POST/PATCH/DELETE" for anything
 * still deferred (versions/drafts LIST/history,
 * locked-documents/preferences, GraphQL, and any collection/global this
 * module doesn't recognize). `/:id/duplicate`, bulk update/delete, and
 * `/access`/`/access/:id?` were all in this deferred list originally - now
 * handled (see `handleDuplicate`, `handleBulkUpdate`/`handleBulkDelete`,
 * `handleAccessRoot`/`handleCollectionAccess`/`handleGlobalAccess` below).
 *
 * ---------------------------------------------------------------------------
 * The reference engine's endpoint-matching precedence, reproduced here
 * ---------------------------------------------------------------------------
 * The reference engine's `sanitizeCollection` (`collections/config/sanitize.js`)
 * pushes `authCollectionEndpoints` (login/logout/me/refresh-token/
 * forgot-password/unlock/reset-password/first-register/verify/init) onto a
 * collection's endpoint list BEFORE `defaultCollectionEndpoints` (find/
 * findByID/create/update/delete/count/...), and `handleEndpoints.js` takes
 * the FIRST method+path match - so for the one real `auth: true` collection
 * in this app (`users`), a literal path segment like `/login` or `/me` is
 * tried as a named auth route BEFORE it would ever be tried as a `/:id`
 * value. This module reproduces that same precedence: a literal-segment
 * check against the fixed set of auth route names, gated on the request's
 * collection being the one auth-enabled collection, runs BEFORE the numeric
 * `:id` fallback for that same collection. `readRegistry`'s own
 * `CollectionReadEntry.config` is deliberately narrower than a real
 * `CollectionConfig` (see `./read-operations.ts`'s `ReadEntityConfig` -
 * `{slug, fields, access?}`, no `auth` field) and was never meant to carry
 * that information, so - matching `./auth.ts`'s own established convention
 * of hardcoding "this app's one `auth: true` collection is `users`" rather
 * than threading a config field through for a fact that is true exactly
 * once in this codebase - `AUTH_COLLECTION_SLUG` below is a hardcoded
 * constant, not a config lookup.
 *
 * ---------------------------------------------------------------------------
 * Response envelopes, confirmed by reading `node_modules/engine@3.88.0` and
 * `node_modules/the vendor package` directly (see the plan doc for the same
 * ground truth, restated here for the functions that actually implement it)
 * ---------------------------------------------------------------------------
 * - GET (list): the raw `PaginatedDocs` shape, no wrapper (`find.js`).
 * - GET /:id: the raw doc, no wrapper (`findByID.js`).
 * - POST (create): `{doc, message}`, 201 (`create.js`).
 * - PATCH /:id: `{doc, message}`, 200 (`updateByID.js`).
 * - DELETE /:id: `{doc, message}`, 200 (`deleteByID.js`). The reference engine's own
 *   `deleteByIDOperation` returns `null` on a missing doc and its HANDLER
 *   special-cases that into a bare `{message}` 404 (no `errors` array) -
 *   this app's own `./operations.ts`'s `deleteDocument` instead THROWS its
 *   own `NotFound` for a missing doc (confirmed by reading it directly), so
 *   this module's `handleDeleteByID` gets the same 404 status through the
 *   generic error-mapping path below (`{errors: [{name, message}]}`)
 *   instead of matching that one bare-`{message}` special case exactly - a
 *   deliberate, documented wire-format simplification: the load-bearing
 *   part (404 on a missing doc) is preserved, and no known real caller in
 *   this app reads the delete-not-found envelope's exact shape (see the
 *   plan doc's REST-consumer inventory - none of this app's 4 known REST
 *   fetch call sites are delete calls).
 * - GET /globals/:slug: the raw doc, no wrapper (`globals/endpoints/
 *   findOne.js`).
 * - POST /globals/:slug (update - NOT PATCH): `{message, result}` - key is
 *   `result`, not `doc` (`globals/endpoints/update.js`) - the one
 *   collection/global response-shape divergence the plan doc flags
 *   explicitly.
 * - GET /count: `{totalDocs}` (`count.js`).
 * - Auth endpoints: see each handler's own doc comment below for its exact
 *   envelope, all confirmed by reading `the vendor source
 *   endpoints/*.js` directly.
 * - Errors: `{errors: [{name?, message, data?}]}` (`utilities/
 *   formatErrors.js`), with the status code the reference engine's own error
 *   classes carry (`errors/{APIError,AuthenticationError,Forbidden,
 *   NotFound,ValidationError,Locked}.js`, all read directly): 400
 *   (ValidationError), 401 (AuthenticationError), 403 (Forbidden), 404
 *   (NotFound), 423 (Locked/this app's own `LockedAuth`). This app's own
 *   local error classes (`./access.ts`'s `Forbidden`, `./operations.ts`'s
 *   `ValidationError`/`NotFound`, `./read-operations.ts`'s own separate
 *   `NotFound`, `./auth.ts`'s `AuthenticationError`/`LockedAuth`/
 *   `InvalidResetToken`) carry only a `message` (confirmed by reading each
 *   directly - none carry a `.status`, unlike the reference engine's `APIError`-
 *   derived classes), so `errorToResponse` below does by `instanceof`
 *   dispatch what the reference engine's own `err.status` field does for free - the
 *   same "reproduce the behavior, the vendor's own carrier field doesn't
 *   exist here" pattern this whole project already follows. Anything NOT
 *   one of those recognized classes is treated as an internal error and
 *   masked to a generic message at 500, matching the reference engine's own
 *   `isErrorPublic`/`routeError.js` policy of hiding non-public error detail
 *   unless `config.debug` is true (this app never sets it).
 *
 * ---------------------------------------------------------------------------
 * Deliberately NOT implemented here (falls through to the reference engine;
 * see the plan doc's "Explicitly deferred to a later sub-stage" list)
 * ---------------------------------------------------------------------------
 * Versions/drafts endpoints (LIST/history/restore); the admin panel's own
 * locked-documents/preferences CRUD; GraphQL. A request that matches a
 * recognized collection/global slug but not one of the routes this module
 * implements (any of the above) returns `null` from `handleRestRequest`, the
 * same as a request for a collection/global slug this module doesn't
 * recognize at all.
 *
 * ---------------------------------------------------------------------------
 * Uploads stage addition: multipart create/update + file serving
 * ---------------------------------------------------------------------------
 * This module's `media` entry in `readRegistry.collections` (Stage 6a)
 * always made `handleRestRequest` claim `/api/media` requests over real
 * The original engine's own, but `handleCreate`/`handleUpdateByID` originally only ever
 * read a JSON body - a real multipart/form-data upload POST (including
 * every upload the reference engine's OWN admin panel UI sends, which already uses
 * the wire shape reproduced below) silently lost its file. Fixed here by
 * teaching `handleCreate`/`handleUpdateByID` to branch on `Content-Type`:
 * a `multipart/*` request is parsed via the standard Fetch API's own
 * `Request.formData()` (built into both Node's undici and this app's real
 * Cloudflare Workers runtime - no busboy/vendor parser needed, unlike real
 * The original engine's own Node-specific `uploads/fetchAPI-multipart/*`), reproducing
 * the reference engine's own `addDataAndFileToRequest.js` wire shape: the document's
 * own fields arrive as a JSON string in a `_data` form field, and the
 * uploaded file arrives as a standard `File` in a `file` form field. See
 * `readMultipartBody`'s own doc comment for the full citation.
 *
 * Also added: `GET /api/media/file/:filename`, the reference engine's own file-
 * serving route (`uploads/endpoints/getFile.js`), reproduced via
 * `./storage.ts`'s `getMediaObjectResponse` - see that module's header for
 * why no access check is needed here (`media`'s `access.read` is the
 * unconditional `() => true`).
 *
 * ---------------------------------------------------------------------------
 * Message text
 * ---------------------------------------------------------------------------
 * The reference engine's success messages are i18n-looked-up and, for
 * create/update/delete, interpolate the collection's own singular/plural
 * label (`general:successfullyCreated` etc, via `getTranslation`). This
 * module uses the same English source strings (confirmed by reading
 * `the vendor package`' `en.js` directly - see each handler's doc
 * comment) but WITHOUT the per-collection label interpolation - a fixed
 * generic string instead (e.g. `'Successfully created.'` rather than
 * `'Faq successfully created.'`). This app never configures a second
 * admin-UI locale (the same finding every prior `localapi/` stage already
 * made for ITS OWN error/log messages), and the plan doc's REST-consumer
 * inventory confirms no real call site in `src/` reads a success message's
 * exact text - only `RsvpForm.tsx` reads an ERROR message (`.errors[0]
 * .message`, from a thrown `ValidationError`, which this module already
 * reproduces verbatim via `err.message`), so this is a documented
 * simplification with no observable effect on any real caller.
 */

import type { Where } from './access'
import { Forbidden } from './access'
import { AuthenticationError, InvalidResetToken, LockedAuth } from './auth'
import type { Engine } from './engine'
import { createEngine } from './engine'
import { clientKey, hit } from '@/features/security/rateLimit'
import { confirmStripeOrder, finalizePaidIntent, getStripeClient, initiateStripePayment, type PaymentsCartDoc } from '@/features/ecommerce/payments/stripeAdapter'
import { CheckoutError } from '@/features/ecommerce/server/pricing'
import { markOrderFailed } from '@/features/ecommerce/server/orders'
import { membershipWebhooks } from '@/features/members/webhooks'
import type Stripe from 'stripe'

import type { FieldConfigLike } from './operations'
import { NotFound as OperationsNotFound, ValidationError } from './operations'
import { parseSearchParams } from './queryParser'
import { NotFound as ReadNotFound } from './read-operations'
import type { VersionsRegistryEntry } from './registry'
import { readRegistry, versionsRegistry } from './registry'
import { getMediaObjectResponse } from './storage'
import type { UploadFile } from './uploads'

/** This app's one real `auth: true` collection - see this file's header for why this is a hardcoded constant rather than a config lookup. */
const AUTH_COLLECTION_SLUG = 'users'

/** This app's one upload-enabled collection - same hardcoding convention as `AUTH_COLLECTION_SLUG` above (see `./uploads.ts`'s and `./storage.ts`'s own file headers for why). */
const UPLOAD_COLLECTION_SLUG = 'media'

const COOKIE_NAME = 'engage-token'

/* -------------------------------------------------------------------------- */
/* Cookie helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Reproduces the reference engine's the original cookie generator for
 * this app's own (unoverridden) auth-cookie config, confirmed by reading
 * `./config.ts` directly: `cookies: {sameSite: 'Lax', secure: false}`,
 * `tokenExpiration` defaults to `./auth.ts`'s own `TOKEN_EXPIRATION_SECONDS`
 * (7200s). Attribute order and casing (`HttpOnly=true`, not the bare
 * `HttpOnly` flag) match `auth/cookies.js`'s own `generateCookie` byte for
 * byte - no `Domain`/`Max-Age`/`Secure` attributes, since this app sets none
 * of those. `cookiePrefix` is the reference engine's default (`'engine'`,
 * unoverridden - already hardcoded as `engage-token` throughout
 * `./auth.ts`), reused here as the same literal constant.
 */
function buildAuthCookie(token: string, expiresInSeconds: number): string {
  const expires = new Date(Date.now() + expiresInSeconds * 1000)
  return `${COOKIE_NAME}=${token}; Expires=${expires.toUTCString()}; Path=/; HttpOnly=true; SameSite=Lax`
}

/** Reproduces the reference engine's the original expired-cookie generator - same attributes as `buildAuthCookie`, empty value, an already-past `Expires` so the browser drops it immediately. */
function buildExpiredAuthCookie(): string {
  const expires = new Date(Date.now() - 1000)
  return `${COOKIE_NAME}=; Expires=${expires.toUTCString()}; Path=/; HttpOnly=true; SameSite=Lax`
}

/** Reads the `engage-token` cookie's raw value out of a request's `Cookie` header, for `extractTokenFromRequest`'s cookie fallback - deliberately NOT reusing `./auth.ts`'s own private `extractCookieToken` (unexported), so this is a second, small, independently-correct implementation of the same "last pair for this key wins" parsing `./auth.ts`'s own doc comment already documents matching the reference engine's `parseCookies` on. */
function readCookieToken(request: Request): string | null {
  const raw = request.headers.get('Cookie')
  if (!raw) return null
  let found: string | null = null
  for (const part of raw.split(';')) {
    const eqIdx = part.indexOf('=')
    const key = (eqIdx === -1 ? part : part.slice(0, eqIdx)).trim()
    if (key !== COOKIE_NAME) continue
    try {
      found = decodeURI(eqIdx === -1 ? '' : part.slice(eqIdx + 1))
    } catch {
      // Same as the reference engine's own parseCookies.js - ignore an undecodable value.
    }
  }
  return found
}

/**
 * Extracts the caller's own raw JWT string from a request, in the reference engine's
 * `extractJWT.js` order (`jwtOrder` defaults to `['JWT', 'Bearer', 'cookie']`,
 * confirmed unoverridden in `engage.config.ts` - see `./auth.ts`'s own header
 * comment, ground-truth point 11): `Authorization: JWT <token>`, then
 * `Authorization: Bearer <token>`, then the `engage-token` cookie.
 *
 * Added after a reference-engine REST parity test caught `handleMe` originally
 * calling `readCookieToken` alone: real `meHandler`'s own `extractJWT(req)`
 * call checks ALL THREE forms, so a caller authenticated via an
 * `Authorization` header (as this app's own REST clients and most API
 * consumers do, not just cookie-based browser sessions) was getting `token`/
 * `exp` silently omitted from `/me`'s response on this side only.
 */
function extractTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get('Authorization')
  if (authorization?.startsWith('JWT ')) return authorization.slice(4)
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7)
  return readCookieToken(request)
}

/** Decodes a JWT's middle (engine) segment WITHOUT verifying its signature - only ever called on a token this module has already independently verified via `engine.auth()` (see `handleMe`), purely to read the `exp` claim back out for the response body, matching the reference engine's own `meHandler` (`decodeJwt` from `jose`, also signature-blind - it trusts `req.user` having already been set by the strategy that ran earlier in the same request). Returns `null` on anything malformed rather than throwing. */
function decodeJwtExpUnsafe(token: string): number | null {
  try {
    const claimsSegment = token.split('.')[1]
    if (!claimsSegment) return null
    const base64 = claimsSegment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Error -> HTTP response mapping                                              */
/* -------------------------------------------------------------------------- */

type ErrorResponseBody = { errors: Array<{ name?: string; message: string; data?: unknown }> }

/** See this file's header, "Errors", for the full mapping rationale and the the reference engine source this reproduces. */
function errorToResponse(err: unknown): { status: number; body: ErrorResponseBody } {
  if (err instanceof ValidationError) {
    return { status: 400, body: { errors: [{ name: 'ValidationError', message: err.message, data: { errors: err.errors } }] } }
  }
  if (err instanceof Forbidden) {
    return { status: 403, body: { errors: [{ name: 'Forbidden', message: err.message }] } }
  }
  if (err instanceof OperationsNotFound || err instanceof ReadNotFound) {
    return { status: 404, body: { errors: [{ name: 'NotFound', message: err.message }] } }
  }
  if (err instanceof LockedAuth) {
    return { status: 423, body: { errors: [{ name: 'LockedAuth', message: err.message }] } }
  }
  if (err instanceof AuthenticationError) {
    return { status: 401, body: { errors: [{ name: 'AuthenticationError', message: err.message }] } }
  }
  if (err instanceof InvalidResetToken) {
    return { status: 400, body: { errors: [{ name: 'InvalidResetToken', message: err.message }] } }
  }
  // Matching the reference engine's own isErrorPublic/routeError.js policy: an
  // unrecognized error is never shown to the caller verbatim (it could
  // carry anything, including sensitive internals) - masked to a generic
  // message at 500, same as the reference engine's own debug-mode-off default.
  return { status: 500, body: { errors: [{ message: 'Something went wrong.' }] } }
}

/** Best-effort JSON body parse for a request that may have none, or malformed JSON - mirrors the reference engine's own defensive `typeof req.data?.x === 'string' ? req.data.x : ''` coercion pattern (confirmed by reading every auth handler directly) rather than letting a malformed body throw an uncaught, unmapped `SyntaxError`. */
async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await request.json()
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Whether `request`'s `Content-Type` is a `multipart/*` body - the same
 * eligibility check the reference engine's own `utilities/addDataAndFileToRequest.js`
 * makes before routing to its own busboy-based multipart parser (confirmed
 * by reading it directly: `contentType?.includes('multipart/')`, `contentType`
 * itself being the header value split on its first `;`).
 */
function isMultipartRequest(request: Request): boolean {
  const contentType = request.headers.get('Content-Type') ?? ''
  return contentType.split(';', 1)[0].trim().toLowerCase().includes('multipart/')
}

/**
 * Reproduces the reference engine's own multipart request wire shape
 * (`utilities/addDataAndFileToRequest.js` + `uploads/fetchAPI-multipart/*`,
 * confirmed by reading both directly): the document's own fields travel as
 * a single JSON string in a `_data` form field - NOT as individual named
 * form fields - and the uploaded file travels in a form field named `file`.
 * The reference engine's OWN admin panel upload UI already submits exactly this
 * shape, which is what makes matching it (rather than inventing a simpler
 * one) the fix for the real, previously-live bug where a real multipart
 * upload POST to `/api/media` was silently misrouted into the JSON-only
 * path (`readJsonBody`) and lost its file entirely.
 *
 * Uses the standard Fetch API's own `Request.formData()`/`File` - built
 * into both Node's undici (this app's test runtime) and the Cloudflare
 * Workers runtime this app actually deploys to - rather than the reference engine's
 * own busboy-based parser (`uploads/fetchAPI-multipart/processMultipart.js`,
 * Node-stream-specific and not something this app's Workers runtime can
 * run), per this project's standing zero-new-runtime-dependencies rule.
 *
 * Bracket-notation nested fields (the reference engine's own `uploads/
 * fetchAPI-multipart/processNested.js`) are NOT reproduced - the reference engine
 * itself only applies that parsing when a caller opts in (`parseNested`,
 * default `false`, confirmed in `fetchAPI-multipart/index.js`), and this
 * app's only upload collection (`media`) has no field that would ever need
 * it (just `alt` plus the upload-computed columns) - not a gap any real
 * upload flow in this app hits.
 */
async function readMultipartBody(request: Request): Promise<{ data: Record<string, unknown>; file?: UploadFile }> {
  const formData = await request.formData()

  let data: Record<string, unknown> = {}
  const dataField = formData.get('_data')
  if (typeof dataField === 'string') {
    try {
      const parsed: unknown = JSON.parse(dataField)
      if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>
    } catch {
      // Matches readJsonBody's own defensive fallback - a malformed
      // `_data` value is treated as "no fields", not a thrown error.
    }
  }

  let file: UploadFile | undefined
  const fileField = formData.get('file')
  if (fileField instanceof File) {
    file = {
      data: new Uint8Array(await fileField.arrayBuffer()),
      mimetype: fileField.type,
      name: fileField.name,
      size: fileField.size,
    }
  }

  return { data, file }
}

/**
 * Reads ANY request body this REST layer accepts, regardless of wire shape -
 * `readMultipartBody` for a `multipart/*` request, `readJsonBody` for
 * everything else. Originally written (and named `readCreateOrUpdateBody`)
 * for just `handleCreate`/`handleUpdateByID`, on the assumption that only a
 * real file upload would ever arrive as multipart. That assumption was
 * wrong: `the vendor package`'s generic `<Form>` component - confirmed by
 * reading `the vendor source` directly -
 * ALWAYS submits via `createFormData()` (`_data: JSON.stringify(data)`
 * plus a `file` field only when the doc's collection is upload-enabled AND a
 * file was picked), for every form it renders: collection create/update,
 * GLOBAL update, and - this is what actually broke production - the admin
 * panel's login, forgot-password, reset-password, and unlock views too, none
 * of which are collection docs at all. So every one of THOSE handlers,
 * having been left on `readJsonBody` alone, threw an uncaught JSON-parse
 * error (surfaced to the user as a bare 500, easily mistaken for "wrong
 * password") the moment they were hit through the real admin UI instead of a
 * JSON API client. Renamed and generalized here rather than left
 * misleadingly narrow; a JSON request never carries a `file` regardless of
 * caller, so every non-upload call site below simply discards it.
 */
async function readRequestBody(request: Request): Promise<{ data: Record<string, unknown>; file?: UploadFile }> {
  if (isMultipartRequest(request)) return readMultipartBody(request)
  return { data: await readJsonBody(request) }
}

/* -------------------------------------------------------------------------- */
/* Collection handlers                                                        */
/* -------------------------------------------------------------------------- */

// `overrideAccess: false` on every REST-facing read below (What's left #2's
// Addresses fix surfaced this live 2026-09-26 - see incident log): this
// app's own Local API defaults `overrideAccess` to `true` when unset,
// deliberately mirroring the reference engine's own Local API default for TRUSTED
// server-side callers (`read-operations.ts`'s file header, point 1). A REST
// request is the untrusted, caller-facing side and must explicitly opt back
// INTO access enforcement, exactly like the reference engine's own generated REST
// route handlers do - omitting it here silently skipped every collection's
// `access.read` (both collection- and field-level, `overrideAccess` gates
// both) for every GET, confirmed live via an anonymous request returning a
// `draft`-status Post and, worse, `Integrations`'s `read: isAdmin` global
// (holds secrets like `claudeApiKey`) being readable by anyone.

async function handleFind(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const result = await engine.find({ collection, where: query.where as Where | undefined, sort: query.sort, limit: query.limit, page: query.page, pagination: query.pagination, depth: query.depth, user, overrideAccess: false })
  return Response.json(result, { status: 200 })
}

/**
 * `?secret=` threaded onto `req.query.secret` for every collection (cheap,
 * ignored by every access function except the ecommerce ones) so a guest
 * cart's `hasCartSecretAccess` (`@/access/ecommerceAccess`) - which reads
 * `req.query.secret`, mirroring the real plugin's own `req.query?.secret` -
 * can actually see it. Stage 10 Ecommerce, Layer 2.
 */
function secretReq(request: Request): { query: { secret?: string } } {
  return { query: { secret: new URL(request.url).searchParams.get('secret') ?? undefined } }
}

async function handleFindByID(engine: Engine, collection: string, id: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const doc = await engine.findByID({ collection, id, depth: query.depth, draft: query.draft, user, req: secretReq(request), overrideAccess: false })
  return Response.json(doc, { status: 200 })
}

async function handleCount(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const result = await engine.count({ collection, where: query.where as Where | undefined, user, overrideAccess: false })
  return Response.json(result, { status: 200 })
}

async function handleCreate(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data, file } = await readRequestBody(request)
  const query = parseSearchParams(new URL(request.url).searchParams)
  const doc = await engine.create({ collection, data, draft: query.draft, user, file })
  return Response.json({ doc, message: 'Successfully created.' }, { status: 201 })
}

async function handleUpdateByID(engine: Engine, collection: string, id: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data, file } = await readRequestBody(request)
  const query = parseSearchParams(new URL(request.url).searchParams)
  const doc = await engine.update({ collection, id, data, draft: query.draft, user, file, req: secretReq(request) })
  return Response.json({ doc, message: 'Updated successfully.' }, { status: 200 })
}

/**
 * `PATCH /api/<collection>` (no id) - the reference engine's own bulk update,
 * reproduced from the vendor source
 * (read directly from `node_modules` to confirm wire shape). `where` is
 * REQUIRED - the reference engine throws a 400 `APIError` for a missing/falsy
 * `where`, confirmed at `operations/update.js` ("Missing 'where' query of
 * documents to update."), reproduced here as the same inline 400 this
 * module already uses for its own hand-rolled validation errors (cart
 * handlers above) rather than routing through `errorToResponse` (no local
 * error class carries that exact reference-engine message).
 *
 * Per-doc update failures don't abort the whole batch - each doc is updated
 * independently (`engine.update` one at a time; confirmed unused in this
 * app's own code per the plan doc, so no engine-level bulk primitive exists
 * to call instead), matching the reference engine's own `Promise.allSettled`-style
 * per-doc error collection: a failed doc's error goes in `errors` (this
 * module's own generic `{message}` shape, not the reference engine's full
 * `{id, isPublic, message}` - the `isPublic` flag has no equivalent among
 * this app's own error classes, and no known caller reads it). Overall
 * status is 200 if every matched doc succeeded, 400 if any failed - matching
 * the reference engine's own `result.errors.length > 0` branch. Zero matched docs is
 * still a 200 with empty `docs`/`errors`, not an error.
 */
async function handleBulkUpdate(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  if (!query.where) {
    return Response.json({ errors: [{ message: "Missing 'where' query of documents to update." }] }, { status: 400 })
  }
  const { data } = await readRequestBody(request)
  const matched = await engine.find({ collection, where: query.where as Where, pagination: false, user, overrideAccess: false })
  const docs: unknown[] = []
  const errors: Array<{ id: unknown; message: string }> = []
  for (const match of matched.docs) {
    const id = (match as { id: unknown }).id
    try {
      const doc = await engine.update({ collection, id: id as number, data, user })
      docs.push(doc)
    } catch (err) {
      errors.push({ id, message: err instanceof Error ? err.message : String(err) })
    }
  }
  const status = errors.length > 0 ? 400 : 200
  const message = errors.length > 0 ? `Unable to update ${errors.length} item${errors.length === 1 ? '' : 's'} out of ${matched.docs.length} total.` : `Updated ${docs.length} item${docs.length === 1 ? '' : 's'} successfully.`
  return Response.json({ docs, errors, message }, { status })
}

/** `GET /api/media/file/:filename` - the reference engine's own `getFile.js` handler, reproduced for this app's one upload collection. No access check here: see `./storage.ts`'s own header for why `media`'s unconditional `access.read: () => true` means the reference engine's own `checkFileAccess` short-circuits to "allowed, no doc lookup" for it. `getMediaObjectResponse` does the actual R2 fetch/range/headers work; this handler only maps its `null` ("no such object") to a 404 in this module's own error-envelope shape. */
async function handleGetMediaFile(filename: string, request: Request): Promise<Response> {
  const response = await getMediaObjectResponse(filename, request)
  if (!response) return Response.json({ errors: [{ name: 'NotFound', message: 'Not Found' }] }, { status: 404 })
  return response
}

async function handleDeleteByID(engine: Engine, collection: string, id: number, user: Parameters<Engine['find']>[0]['user'], request: Request): Promise<Response> {
  const doc = await engine.delete({ collection, id, user, req: secretReq(request) })
  return Response.json({ doc, message: 'Deleted successfully.' }, { status: 200 })
}

/** `DELETE /api/<collection>` (no id) - the reference engine's own bulk delete, same shape/rationale as `handleBulkUpdate` above (see its doc comment): `where` required (400 if missing), per-doc `engine.delete` calls collected into `docs`/`errors`, 200 unless any doc failed. */
async function handleBulkDelete(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  if (!query.where) {
    return Response.json({ errors: [{ message: "Missing 'where' query of documents to delete." }] }, { status: 400 })
  }
  const matched = await engine.find({ collection, where: query.where as Where, pagination: false, user, overrideAccess: false })
  const docs: unknown[] = []
  const errors: Array<{ id: unknown; message: string }> = []
  for (const match of matched.docs) {
    const id = (match as { id: unknown }).id
    try {
      const doc = await engine.delete({ collection, id: id as number, user })
      docs.push(doc)
    } catch (err) {
      errors.push({ id, message: err instanceof Error ? err.message : String(err) })
    }
  }
  const status = errors.length > 0 ? 400 : 200
  const message = errors.length > 0 ? `Unable to delete ${errors.length} item${errors.length === 1 ? '' : 's'} out of ${matched.docs.length} total.` : `Deleted ${docs.length} item${docs.length === 1 ? '' : 's'} successfully.`
  return Response.json({ docs, errors, message }, { status })
}

/**
 * `POST /api/<collection>/:id/duplicate` - the reference engine's own duplicate
 * endpoint, reproduced from the vendor source
 * (read directly from `node_modules` to confirm the wire shape below).
 *
 * `applyBeforeDuplicate` reproduces the reference engine's DEFAULT `beforeDuplicate`
 * field hook (the vendor source), which is
 * the only variant this app needs: grepped every field literal under `src/`
 * for a custom `hooks.beforeDuplicate` - none declare one, so only the
 * default behavior ever applies. That default only touches `unique` fields
 * (a `required`-only field is duplicated verbatim, unchanged): string-ish
 * types (`text`/`textarea`/`code`/`json`) get `' - Copy'` appended so the
 * unique constraint doesn't collide on create; every other unique type
 * (`email`/`number`/`point`/`relationship`/`select`/`upload`) is cleared to
 * `undefined` instead, since there's no generic way to mint a new unique
 * value for those. The recursion shape (row/collapsible flatten, group
 * nests by name, array/blocks iterate rows by `blockType`) mirrors
 * `traverseBeforeChange` above exactly, minus everything that function does
 * that duplication doesn't need (hooks, validation, access).
 *
 * `readRegistry.collections[slug].config` is typed as the narrower
 * `ReadEntityConfig`, but the actual object at runtime IS the real,
 * sanitized the original engine collection config (same object `admin/auth.ts`'s own
 * `allCollectionConfigs` casts for the same reason - see that file's
 * header) - safe to cast to `FieldConfigLike[]` here to read `.unique`,
 * which `ReadEntityConfig`'s own field type doesn't declare.
 *
 * Message text doesn't chase the reference engine's exact translated string
 * (`general:successfullyDuplicated`) - this module already uses its own
 * terse messages for create/update/delete (see those handlers above), not
 * the reference engine's i18n keys, so duplicate matches that existing convention
 * instead of introducing a one-off exact-string dependency.
 */
const UNIQUE_STRING_TYPES = new Set(['code', 'json', 'text', 'textarea'])
const UNIQUE_CLEAR_TYPES = new Set(['email', 'number', 'point', 'relationship', 'select', 'upload'])

function applyBeforeDuplicate(fields: FieldConfigLike[], data: Record<string, unknown>): void {
  for (const field of fields) {
    if (field.type === 'join') continue

    if (field.type === 'row' || field.type === 'collapsible') {
      applyBeforeDuplicate(field.fields ?? [], data)
      continue
    }

    const name = field.name
    if (typeof name !== 'string') continue

    if (field.type === 'group') {
      if (data[name] && typeof data[name] === 'object') applyBeforeDuplicate(field.fields ?? [], data[name] as Record<string, unknown>)
      continue
    }

    if (field.unique) {
      const value = data[name]
      if (UNIQUE_STRING_TYPES.has(field.type) && typeof value === 'string' && value.trim() !== '') {
        data[name] = `${value} - Copy`
      } else if (UNIQUE_CLEAR_TYPES.has(field.type)) {
        data[name] = undefined
      }
    }

    if (field.type === 'array' && Array.isArray(data[name])) {
      for (const row of data[name] as Record<string, unknown>[]) applyBeforeDuplicate(field.fields ?? [], row)
    } else if (field.type === 'blocks' && Array.isArray(data[name])) {
      for (const row of data[name] as Record<string, unknown>[]) {
        const blockConfig = (field.blocks ?? []).find((b) => b.slug === row?.blockType)
        if (blockConfig) applyBeforeDuplicate(blockConfig.fields, row)
      }
    }
  }
}

async function handleDuplicate(engine: Engine, collection: string, id: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const source = (await engine.findByID({ collection, depth: 0, id, overrideAccess: false, req: secretReq(request), user })) as unknown as Record<string, unknown>
  const data: Record<string, unknown> = { ...source }
  delete data.id
  delete data.createdAt
  delete data.updatedAt
  // A fresh doc gets its own draft/published state via the `draft: true`
  // passed to `engine.create` below (matching the reference engine's own default),
  // not the source doc's copied `_status`.
  delete data._status
  // Section/page locks belong to the source document; a copy starts unlocked (and lockGuard would 403 non-managers on create).
  delete data.locks

  const fields = (readRegistry.collections[collection]?.config.fields ?? []) as unknown as FieldConfigLike[]
  applyBeforeDuplicate(fields, data)

  const doc = await engine.create({ collection, data, draft: true, user })
  return Response.json({ doc, message: 'Successfully duplicated.' }, { status: 200 })
}
