/**
 * REST + GraphQL API removal (Stage 7), sub-step 3: the REST handler layer
 * itself - a hand-rolled, from-scratch replacement for the SUBSET of real
 * Payload's REST surface this stage puts in scope (see
 * payload-removal-plan.md's "REST + GraphQL API removal (Stage 7)" section
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
 * fall through to real Payload's REST_GET/POST/PATCH/DELETE" for anything
 * still deferred (versions/drafts LIST/history,
 * locked-documents/preferences, GraphQL, and any collection/global this
 * module doesn't recognize). `/:id/duplicate`, bulk update/delete, and
 * `/access`/`/access/:id?` were all in this deferred list originally - now
 * handled (see `handleDuplicate`, `handleBulkUpdate`/`handleBulkDelete`,
 * `handleAccessRoot`/`handleCollectionAccess`/`handleGlobalAccess` below).
 *
 * ---------------------------------------------------------------------------
 * Real Payload's endpoint-matching precedence, reproduced here
 * ---------------------------------------------------------------------------
 * Real Payload's `sanitizeCollection` (`collections/config/sanitize.js`)
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
 * Response envelopes, confirmed by reading `node_modules/payload@3.88.0` and
 * `node_modules/@payloadcms/next` directly (see the plan doc for the same
 * ground truth, restated here for the functions that actually implement it)
 * ---------------------------------------------------------------------------
 * - GET (list): the raw `PaginatedDocs` shape, no wrapper (`find.js`).
 * - GET /:id: the raw doc, no wrapper (`findByID.js`).
 * - POST (create): `{doc, message}`, 201 (`create.js`).
 * - PATCH /:id: `{doc, message}`, 200 (`updateByID.js`).
 * - DELETE /:id: `{doc, message}`, 200 (`deleteByID.js`). Real Payload's own
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
 *   envelope, all confirmed by reading `node_modules/payload/dist/auth/
 *   endpoints/*.js` directly.
 * - Errors: `{errors: [{name?, message, data?}]}` (`utilities/
 *   formatErrors.js`), with the status code real Payload's own error
 *   classes carry (`errors/{APIError,AuthenticationError,Forbidden,
 *   NotFound,ValidationError,Locked}.js`, all read directly): 400
 *   (ValidationError), 401 (AuthenticationError), 403 (Forbidden), 404
 *   (NotFound), 423 (Locked/this app's own `LockedAuth`). This app's own
 *   local error classes (`./access.ts`'s `Forbidden`, `./operations.ts`'s
 *   `ValidationError`/`NotFound`, `./read-operations.ts`'s own separate
 *   `NotFound`, `./auth.ts`'s `AuthenticationError`/`LockedAuth`/
 *   `InvalidResetToken`) carry only a `message` (confirmed by reading each
 *   directly - none carry a `.status`, unlike real Payload's `APIError`-
 *   derived classes), so `errorToResponse` below does by `instanceof`
 *   dispatch what real Payload's own `err.status` field does for free - the
 *   same "reproduce the behavior, the vendor's own carrier field doesn't
 *   exist here" pattern this whole project already follows. Anything NOT
 *   one of those recognized classes is treated as an internal error and
 *   masked to a generic message at 500, matching real Payload's own
 *   `isErrorPublic`/`routeError.js` policy of hiding non-public error detail
 *   unless `config.debug` is true (this app never sets it).
 *
 * ---------------------------------------------------------------------------
 * Deliberately NOT implemented here (falls through to real Payload;
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
 * Payload's own, but `handleCreate`/`handleUpdateByID` originally only ever
 * read a JSON body - a real multipart/form-data upload POST (including
 * every upload real Payload's OWN admin panel UI sends, which already uses
 * the wire shape reproduced below) silently lost its file. Fixed here by
 * teaching `handleCreate`/`handleUpdateByID` to branch on `Content-Type`:
 * a `multipart/*` request is parsed via the standard Fetch API's own
 * `Request.formData()` (built into both Node's undici and this app's real
 * Cloudflare Workers runtime - no busboy/vendor parser needed, unlike real
 * Payload's own Node-specific `uploads/fetchAPI-multipart/*`), reproducing
 * real Payload's own `addDataAndFileToRequest.js` wire shape: the document's
 * own fields arrive as a JSON string in a `_payload` form field, and the
 * uploaded file arrives as a standard `File` in a `file` form field. See
 * `readMultipartBody`'s own doc comment for the full citation.
 *
 * Also added: `GET /api/media/file/:filename`, real Payload's own file-
 * serving route (`uploads/endpoints/getFile.js`), reproduced via
 * `./storage.ts`'s `getMediaObjectResponse` - see that module's header for
 * why no access check is needed here (`media`'s `access.read` is the
 * unconditional `() => true`).
 *
 * ---------------------------------------------------------------------------
 * Message text
 * ---------------------------------------------------------------------------
 * Real Payload's success messages are i18n-looked-up and, for
 * create/update/delete, interpolate the collection's own singular/plural
 * label (`general:successfullyCreated` etc, via `getTranslation`). This
 * module uses the same English source strings (confirmed by reading
 * `@payloadcms/translations`' `en.js` directly - see each handler's doc
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
import { confirmStripeOrder, getStripeClient, initiateStripePayment, type PaymentsCartDoc } from '@/features/ecommerce/payments/stripeAdapter'
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

const COOKIE_NAME = 'payload-token'

/* -------------------------------------------------------------------------- */
/* Cookie helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Reproduces real Payload's `generatePayloadCookie` (`auth/cookies.js`) for
 * this app's own (unoverridden) auth-cookie config, confirmed by reading
 * `./config.ts` directly: `cookies: {sameSite: 'Lax', secure: false}`,
 * `tokenExpiration` defaults to `./auth.ts`'s own `TOKEN_EXPIRATION_SECONDS`
 * (7200s). Attribute order and casing (`HttpOnly=true`, not the bare
 * `HttpOnly` flag) match `auth/cookies.js`'s own `generateCookie` byte for
 * byte - no `Domain`/`Max-Age`/`Secure` attributes, since this app sets none
 * of those. `cookiePrefix` is real Payload's default (`'payload'`,
 * unoverridden - already hardcoded as `payload-token` throughout
 * `./auth.ts`), reused here as the same literal constant.
 */
function buildAuthCookie(token: string, expiresInSeconds: number): string {
  const expires = new Date(Date.now() + expiresInSeconds * 1000)
  return `${COOKIE_NAME}=${token}; Expires=${expires.toUTCString()}; Path=/; HttpOnly=true; SameSite=Lax`
}

/** Reproduces real Payload's `generateExpiredPayloadCookie` - same attributes as `buildAuthCookie`, empty value, an already-past `Expires` so the browser drops it immediately. */
function buildExpiredAuthCookie(): string {
  const expires = new Date(Date.now() - 1000)
  return `${COOKIE_NAME}=; Expires=${expires.toUTCString()}; Path=/; HttpOnly=true; SameSite=Lax`
}

/** Reads the `payload-token` cookie's raw value out of a request's `Cookie` header, for `extractTokenFromRequest`'s cookie fallback - deliberately NOT reusing `./auth.ts`'s own private `extractCookieToken` (unexported), so this is a second, small, independently-correct implementation of the same "last pair for this key wins" parsing `./auth.ts`'s own doc comment already documents matching real Payload's `parseCookies` on. */
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
      // Same as real Payload's own parseCookies.js - ignore an undecodable value.
    }
  }
  return found
}

/**
 * Extracts the caller's own raw JWT string from a request, in real Payload's
 * `extractJWT.js` order (`jwtOrder` defaults to `['JWT', 'Bearer', 'cookie']`,
 * confirmed unoverridden in `engage.config.ts` - see `./auth.ts`'s own header
 * comment, ground-truth point 11): `Authorization: JWT <token>`, then
 * `Authorization: Bearer <token>`, then the `payload-token` cookie.
 *
 * Added after a real-Payload REST parity test caught `handleMe` originally
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

/** Decodes a JWT's middle (payload) segment WITHOUT verifying its signature - only ever called on a token this module has already independently verified via `engine.auth()` (see `handleMe`), purely to read the `exp` claim back out for the response body, matching real Payload's own `meHandler` (`decodeJwt` from `jose`, also signature-blind - it trusts `req.user` having already been set by the strategy that ran earlier in the same request). Returns `null` on anything malformed rather than throwing. */
function decodeJwtExpUnsafe(token: string): number | null {
  try {
    const payloadSegment = token.split('.')[1]
    if (!payloadSegment) return null
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
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

/** See this file's header, "Errors", for the full mapping rationale and the real Payload source this reproduces. */
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
  // Matching real Payload's own isErrorPublic/routeError.js policy: an
  // unrecognized error is never shown to the caller verbatim (it could
  // carry anything, including sensitive internals) - masked to a generic
  // message at 500, same as real Payload's own debug-mode-off default.
  return { status: 500, body: { errors: [{ message: 'Something went wrong.' }] } }
}

/** Best-effort JSON body parse for a request that may have none, or malformed JSON - mirrors real Payload's own defensive `typeof req.data?.x === 'string' ? req.data.x : ''` coercion pattern (confirmed by reading every auth handler directly) rather than letting a malformed body throw an uncaught, unmapped `SyntaxError`. */
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
 * eligibility check real Payload's own `utilities/addDataAndFileToRequest.js`
 * makes before routing to its own busboy-based multipart parser (confirmed
 * by reading it directly: `contentType?.includes('multipart/')`, `contentType`
 * itself being the header value split on its first `;`).
 */
function isMultipartRequest(request: Request): boolean {
  const contentType = request.headers.get('Content-Type') ?? ''
  return contentType.split(';', 1)[0].trim().toLowerCase().includes('multipart/')
}

/**
 * Reproduces real Payload's own multipart request wire shape
 * (`utilities/addDataAndFileToRequest.js` + `uploads/fetchAPI-multipart/*`,
 * confirmed by reading both directly): the document's own fields travel as
 * a single JSON string in a `_payload` form field - NOT as individual named
 * form fields - and the uploaded file travels in a form field named `file`.
 * Real Payload's OWN admin panel upload UI already submits exactly this
 * shape, which is what makes matching it (rather than inventing a simpler
 * one) the fix for the real, previously-live bug where a real multipart
 * upload POST to `/api/media` was silently misrouted into the JSON-only
 * path (`readJsonBody`) and lost its file entirely.
 *
 * Uses the standard Fetch API's own `Request.formData()`/`File` - built
 * into both Node's undici (this app's test runtime) and the Cloudflare
 * Workers runtime this app actually deploys to - rather than real Payload's
 * own busboy-based parser (`uploads/fetchAPI-multipart/processMultipart.js`,
 * Node-stream-specific and not something this app's Workers runtime can
 * run), per this project's standing zero-new-runtime-dependencies rule.
 *
 * Bracket-notation nested fields (real Payload's own `uploads/
 * fetchAPI-multipart/processNested.js`) are NOT reproduced - real Payload
 * itself only applies that parsing when a caller opts in (`parseNested`,
 * default `false`, confirmed in `fetchAPI-multipart/index.js`), and this
 * app's only upload collection (`media`) has no field that would ever need
 * it (just `alt` plus the upload-computed columns) - not a gap any real
 * upload flow in this app hits.
 */
async function readMultipartBody(request: Request): Promise<{ data: Record<string, unknown>; file?: UploadFile }> {
  const formData = await request.formData()

  let data: Record<string, unknown> = {}
  const payloadField = formData.get('_payload')
  if (typeof payloadField === 'string') {
    try {
      const parsed: unknown = JSON.parse(payloadField)
      if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>
    } catch {
      // Matches readJsonBody's own defensive fallback - a malformed
      // `_payload` value is treated as "no fields", not a thrown error.
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
 * wrong: `@payloadcms/ui`'s generic `<Form>` component - confirmed by
 * reading `node_modules/@payloadcms/ui/dist/forms/Form/index.js` directly -
 * ALWAYS submits via `createFormData()` (`_payload: JSON.stringify(data)`
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
// deliberately mirroring real Payload's own Local API default for TRUSTED
// server-side callers (`read-operations.ts`'s file header, point 1). A REST
// request is the untrusted, caller-facing side and must explicitly opt back
// INTO access enforcement, exactly like real Payload's own generated REST
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
 * `PATCH /api/<collection>` (no id) - real Payload's own bulk update,
 * reproduced from `payload/dist/collections/{endpoints,operations}/update.js`
 * (read directly from `node_modules` to confirm wire shape). `where` is
 * REQUIRED - real Payload throws a 400 `APIError` for a missing/falsy
 * `where`, confirmed at `operations/update.js` ("Missing 'where' query of
 * documents to update."), reproduced here as the same inline 400 this
 * module already uses for its own hand-rolled validation errors (cart
 * handlers above) rather than routing through `errorToResponse` (no local
 * error class carries that exact real-Payload message).
 *
 * Per-doc update failures don't abort the whole batch - each doc is updated
 * independently (`engine.update` one at a time; confirmed unused in this
 * app's own code per the plan doc, so no engine-level bulk primitive exists
 * to call instead), matching real Payload's own `Promise.allSettled`-style
 * per-doc error collection: a failed doc's error goes in `errors` (this
 * module's own generic `{message}` shape, not real Payload's full
 * `{id, isPublic, message}` - the `isPublic` flag has no equivalent among
 * this app's own error classes, and no known caller reads it). Overall
 * status is 200 if every matched doc succeeded, 400 if any failed - matching
 * real Payload's own `result.errors.length > 0` branch. Zero matched docs is
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

/** `GET /api/media/file/:filename` - real Payload's own `getFile.js` handler, reproduced for this app's one upload collection. No access check here: see `./storage.ts`'s own header for why `media`'s unconditional `access.read: () => true` means real Payload's own `checkFileAccess` short-circuits to "allowed, no doc lookup" for it. `getMediaObjectResponse` does the actual R2 fetch/range/headers work; this handler only maps its `null` ("no such object") to a 404 in this module's own error-envelope shape. */
async function handleGetMediaFile(filename: string, request: Request): Promise<Response> {
  const response = await getMediaObjectResponse(filename, request)
  if (!response) return Response.json({ errors: [{ name: 'NotFound', message: 'Not Found' }] }, { status: 404 })
  return response
}

async function handleDeleteByID(engine: Engine, collection: string, id: number, user: Parameters<Engine['find']>[0]['user'], request: Request): Promise<Response> {
  const doc = await engine.delete({ collection, id, user, req: secretReq(request) })
  return Response.json({ doc, message: 'Deleted successfully.' }, { status: 200 })
}

/** `DELETE /api/<collection>` (no id) - real Payload's own bulk delete, same shape/rationale as `handleBulkUpdate` above (see its doc comment): `where` required (400 if missing), per-doc `engine.delete` calls collected into `docs`/`errors`, 200 unless any doc failed. */
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
 * `POST /api/<collection>/:id/duplicate` - real Payload's own duplicate
 * endpoint, reproduced from `payload/dist/collections/endpoints/duplicate.js`
 * (read directly from `node_modules` to confirm the wire shape below).
 *
 * `applyBeforeDuplicate` reproduces real Payload's DEFAULT `beforeDuplicate`
 * field hook (`payload/dist/fields/setDefaultBeforeDuplicate.js`), which is
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
 * sanitized Payload collection config (same object `admin/auth.ts`'s own
 * `allCollectionConfigs` casts for the same reason - see that file's
 * header) - safe to cast to `FieldConfigLike[]` here to read `.unique`,
 * which `ReadEntityConfig`'s own field type doesn't declare.
 *
 * Message text doesn't chase real Payload's exact translated string
 * (`general:successfullyDuplicated`) - this module already uses its own
 * terse messages for create/update/delete (see those handlers above), not
 * real Payload's i18n keys, so duplicate matches that existing convention
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
  // passed to `engine.create` below (matching real Payload's own default),
  // not the source doc's copied `_status`.
  delete data._status

  const fields = (readRegistry.collections[collection]?.config.fields ?? []) as unknown as FieldConfigLike[]
  applyBeforeDuplicate(fields, data)

  const doc = await engine.create({ collection, data, draft: true, user })
  return Response.json({ doc, message: 'Successfully duplicated.' }, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* /api/access (root), POST /api/<collection>/access/:id?, POST               */
/* /api/globals/<slug>/access - Stage 7                                       */
/*                                                                            */
/* Reproduced from `payload/dist/auth/{endpoints,operations}/access.js`,      */
/* `auth/getAccessResults.js`, `utilities/getEntityPermissions/               */
/* {getEntityPermissions,populateFieldPermissions}.js`,                       */
/* `utilities/sanitizePermissions.js`, `collections/endpoints/docAccess.js`,  */
/* `globals/endpoints/docAccess.js` (all read directly from `node_modules` to */
/* confirm exact wire behavior).                                              */
/*                                                                            */
/* Root `GET /api/access` needs no auth - it computes a permission tree for   */
/* every registered collection/global against whatever `user` is present     */
/* (or none). Per-collection is `POST /api/<collection>/access/:id?` (id      */
/* OPTIONAL - the no-id case is how the real admin UI checks "can I create a  */
/* new one at all"), body is a raw `data` object used to evaluate access      */
/* functions that read doc/sibling values. Per-global is                     */
/* `POST /api/globals/<slug>/access` (no id - globals are singletons).        */
/*                                                                            */
/* Default when an entity/field declares NO access function for an operation */
/* is `isLoggedIn` (real Payload's own default, confirmed in                 */
/* `getEntityPermissions.js` - NOT unconditional `true`, and deliberately    */
/* NOT this module's own `admin/auth.ts`'s `evaluateAccess` helper, which     */
/* defaults to `true` for a different, narrower caller). A field WITH no      */
/* access function inherits its already-resolved PARENT's permission for      */
/* that operation (not a fresh `isLoggedIn` check) - confirmed in            */
/* `populateFieldPermissions.js`.                                            */
/*                                                                            */
/* An access function that returns a `Where` query object (rather than a     */
/* plain boolean) is, per real Payload's own `processWhereQuery`, resolved   */
/* against the actual document ONLY when `fetchData` is true (the id-present */
/* per-collection/global case) - otherwise (root, and the no-id per-         */
/* collection case) it's left unresolved as `{permission: true, where}`.     */
/* DOCUMENTED SIMPLIFICATION: this module treats a `Where`-object result as  */
/* `{permission: true, where}` in EVERY case, including id-present, rather   */
/* than running the real `entityDocExists` DB check against it - matching    */
/* the plan doc's established pattern of documenting a wire-fidelity gap     */
/* rather than building full parity for it (no known caller in this app's    */
/* own admin UI reads a `where`-restricted access result's resolved boolean  */
/* rather than just checking for the key's presence, which this module       */
/* already reproduces exactly).                                              */
/* -------------------------------------------------------------------------- */

/** A real Payload access function's call shape, as every access fn in this app's own `src/collections/*`/`src/globals/*` configs is already written against (`({req}) => ...`, occasionally reading `id`/`data` too - real Payload's full signature is `({req, id, data, siblingData})`, this module only ever needs `req`/`id`/`data`). */
type AccessFn = (args: { req: { user: unknown; payload: Engine }; id?: unknown; data?: unknown }) => unknown

type EntityAccessConfigLike = {
  create?: AccessFn
  read?: AccessFn
  update?: AccessFn
  delete?: AccessFn
  unlock?: AccessFn
  readVersions?: AccessFn
  admin?: AccessFn
}

/** A hand-rolled structural mirror of real Payload's `Field` type, scoped to exactly what this module's field-permission recursion needs (name/type/nesting/`access`) - same "structural mirror, not an import" convention as `./operations.ts`'s own `FieldConfigLike` (see that type's doc comment), just widened with `access` and `tabs`, neither of which `FieldConfigLike` declares (that type was built for `applyBeforeDuplicate`'s narrower needs). */
type AccessFieldLike = {
  name?: string
  type: string
  fields?: AccessFieldLike[]
  blocks?: Array<{ slug: string; fields: AccessFieldLike[] }>
  tabs?: Array<{ name?: string; fields: AccessFieldLike[] }>
  access?: { create?: AccessFn; read?: AccessFn; update?: AccessFn }
}

type AccessEntityConfigLike = {
  slug: string
  access?: EntityAccessConfigLike
  fields?: AccessFieldLike[]
  auth?: unknown
  versions?: unknown
}

type AccessResult = { permission: boolean; where?: Where }

/** Calls one access function (or applies the `isLoggedIn` default when none is declared) and normalizes its result to `{permission, where?}` - see this section's header comment for the `Where`-object handling's documented simplification. */
async function callAccessFn(fn: AccessFn | undefined, isLoggedIn: boolean, id: unknown, data: unknown, user: unknown, engine: Engine): Promise<AccessResult> {
  if (typeof fn !== 'function') return { permission: isLoggedIn }
  let result: unknown
  try {
    result = await fn({ req: { user, payload: engine }, id, data })
  } catch {
    return { permission: false }
  }
  if (typeof result === 'boolean') return { permission: result }
  if (result && typeof result === 'object') return { permission: true, where: result as Where }
  return { permission: Boolean(result) }
}

/** Real Payload's `sanitizePermissions.js` wire value for one resolved operation: omitted entirely (`undefined`) when denied, literal `true` when allowed with no `where` restriction, or the unresolved `{permission: true, where}` object when allowed-with-a-where (see this section's header comment). */
function accessPermissionValue(result: AccessResult): true | { permission: true; where: Where } | undefined {
  if (!result.permission) return undefined
  if (result.where) return { permission: true, where: result.where }
  return true
}

/** A `fields`/`blocks` container collapses to literal `true` (real Payload's own `sanitizePermissions.js` behavior) only when it has at least one entry and every entry is itself literal `true`. */
function collapseIfAllTrue(obj: Record<string, unknown>): Record<string, unknown> | true {
  const keys = Object.keys(obj)
  if (keys.length > 0 && keys.every((k) => obj[k] === true)) return true
  return obj
}

/**
 * Reproduces `populateFieldPermissions.js`'s recursion: every named field
 * gets its own `access[op]` evaluated (or inherits the parent's already-
 * resolved permission for that op when it declares none); unnamed group/row/
 * collapsible fields recurse transparently (no extra nesting level in the
 * output); named `group`/`array` fields nest under `fields`; `blocks` fields
 * nest per-block-slug under `blocks`; named `tabs` nest like a named group,
 * unnamed tabs recurse transparently. `delete`/`readVersions`/`unlock` are
 * never field-level operations (real Payload's own `continue` for those -
 * confirmed reading the source) - only `create`/`read`/`update` reach here.
 */
async function buildFieldPermissions(fields: AccessFieldLike[], operations: string[], parent: Record<string, AccessResult>, data: unknown, user: unknown, engine: Engine): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  const isLoggedIn = Boolean(user)

  for (const field of fields) {
    if (field.type === 'tabs' && field.tabs) {
      for (const tab of field.tabs) {
        if (tab.name) {
          const tabFields = await buildFieldPermissions(tab.fields, operations, parent, data, user, engine)
          const collapsed = collapseIfAllTrue(tabFields)
          if (Object.keys(tabFields).length > 0) out[tab.name] = { fields: collapsed }
        } else {
          Object.assign(out, await buildFieldPermissions(tab.fields, operations, parent, data, user, engine))
        }
      }
      continue
    }

    if (!field.name) {
      if (field.fields) Object.assign(out, await buildFieldPermissions(field.fields, operations, parent, data, user, engine))
      continue
    }

    const resolvedOps: Record<string, AccessResult> = {}
    const fieldNode: Record<string, unknown> = {}
    let allOpsTrue = true
    for (const op of operations) {
      const fieldFn = field.access?.[op as 'create' | 'read' | 'update']
      const result = typeof fieldFn === 'function' ? await callAccessFn(fieldFn, isLoggedIn, undefined, data, user, engine) : (parent[op] ?? { permission: false })
      resolvedOps[op] = result
      const value = accessPermissionValue(result)
      if (value === undefined) allOpsTrue = false
      else {
        fieldNode[op] = value
        if (value !== true) allOpsTrue = false
      }
    }

    const childData = data && typeof data === 'object' ? (data as Record<string, unknown>)[field.name] : undefined

    if (field.fields && field.fields.length > 0) {
      const nested = await buildFieldPermissions(field.fields, operations, resolvedOps, childData, user, engine)
      if (Object.keys(nested).length > 0) {
        const collapsedNested = collapseIfAllTrue(nested)
        fieldNode.fields = collapsedNested
        if (collapsedNested !== true) allOpsTrue = false
      }
    }
    if (field.blocks && field.blocks.length > 0) {
      const blocksOut: Record<string, unknown> = {}
      for (const block of field.blocks) {
        const blockFields = await buildFieldPermissions(block.fields, operations, resolvedOps, undefined, user, engine)
        if (Object.keys(blockFields).length > 0) blocksOut[block.slug] = { fields: collapseIfAllTrue(blockFields) }
      }
      if (Object.keys(blocksOut).length > 0) {
        const collapsedBlocks = collapseIfAllTrue(blocksOut)
        fieldNode.blocks = collapsedBlocks
        if (collapsedBlocks !== true) allOpsTrue = false
      }
    }

    if (allOpsTrue && Object.keys(fieldNode).length > 0) out[field.name] = true
    else if (Object.keys(fieldNode).length > 0) out[field.name] = fieldNode
  }

  return out
}

/** Reproduces `getEntityPermissions.js`'s per-entity (collection or global) result: top-level `operations` resolved against `entity.access`, then `entity.fields` recursed via `buildFieldPermissions` (always present as `fields`, collapsing to `true` when every field is fully permitted, `{}` when nothing under it is). */
async function getEntityAccessResult(entity: AccessEntityConfigLike, operations: string[], id: unknown, data: unknown, user: unknown, engine: Engine): Promise<Record<string, unknown>> {
  const isLoggedIn = Boolean(user)
  const out: Record<string, unknown> = {}
  const resolvedOps: Record<string, AccessResult> = {}
  for (const op of operations) {
    const fn = entity.access?.[op as keyof EntityAccessConfigLike]
    const result = await callAccessFn(fn, isLoggedIn, id, data, user, engine)
    resolvedOps[op] = result
    const value = accessPermissionValue(result)
    if (value !== undefined) out[op] = value
  }
  const fieldOps = operations.filter((op) => op === 'create' || op === 'read' || op === 'update')
  const fieldsTree = await buildFieldPermissions(entity.fields ?? [], fieldOps, resolvedOps, data, user, engine)
  out.fields = collapseIfAllTrue(fieldsTree)
  return out
}

/** The set of top-level operations `getAccessResults.js` checks for a collection: `create/read/update/delete`, plus `unlock` when the collection is auth-enabled with a nonzero (or default) `maxLoginAttempts`, plus `readVersions` when it has `versions`. */
function collectionAccessOperations(entity: AccessEntityConfigLike): string[] {
  const ops = ['create', 'read', 'update', 'delete']
  const authCfg = entity.auth as { maxLoginAttempts?: number } | boolean | undefined
  const authEnabled = authCfg === true || (authCfg && typeof authCfg === 'object')
  const maxLoginAttempts = authCfg && typeof authCfg === 'object' ? authCfg.maxLoginAttempts : undefined
  if (authEnabled && maxLoginAttempts !== 0) ops.push('unlock')
  if (entity.versions) ops.push('readVersions')
  return ops
}

/** `getAccessResults.js`'s `canAccessAdmin`: only computed when the requesting user belongs to `config.admin.user`'s own collection (this app's is always `AUTH_COLLECTION_SLUG`/`'users'`, per `engage.config.ts`'s `admin.user: Users.slug` - same hardcoding convention as `AUTH_COLLECTION_SLUG` itself, see this file's header), via that collection's own `access.admin` (or `isLoggedIn` when it declares none). `false` for an anonymous request or a user from any other collection. */
async function computeCanAccessAdmin(user: unknown, engine: Engine): Promise<boolean> {
  if (!user) return false
  const userCollection = (user as { collection?: unknown }).collection
  if (userCollection !== AUTH_COLLECTION_SLUG) return false
  const usersConfig = readRegistry.collections[AUTH_COLLECTION_SLUG]?.config as unknown as AccessEntityConfigLike | undefined
  const adminFn = usersConfig?.access?.admin
  const result = await callAccessFn(adminFn, true, undefined, undefined, user, engine)
  return result.permission
}

/** `GET /api/access` (root, no auth required) - iterates every registered collection/global (`readRegistry`) and computes its full permission tree against whatever `user` is present (or none). */
async function handleAccessRoot(engine: Engine, user: unknown): Promise<Response> {
  const canAccessAdmin = await computeCanAccessAdmin(user, engine)
  const collections: Record<string, unknown> = {}
  for (const slug of Object.keys(readRegistry.collections)) {
    const config = readRegistry.collections[slug]?.config as unknown as AccessEntityConfigLike
    collections[slug] = await getEntityAccessResult(config, collectionAccessOperations(config), undefined, undefined, user, engine)
  }
  const globals: Record<string, unknown> = {}
  for (const slug of Object.keys(readRegistry.globals)) {
    const config = readRegistry.globals[slug]?.config as unknown as AccessEntityConfigLike
    const ops = config.versions ? ['read', 'update', 'readVersions'] : ['read', 'update']
    globals[slug] = await getEntityAccessResult(config, ops, undefined, undefined, user, engine)
  }
  const body: Record<string, unknown> = { collections, globals }
  if (canAccessAdmin) body.canAccessAdmin = true
  return Response.json(body, { status: 200 })
}

/** Best-effort parse of a POST body's JSON `data` object - real Payload's `req.data`, used by access functions that read doc/sibling values. A missing/unparseable body is `undefined`, not an error (matching `docAccessOperation`'s own `hasData` check falling through to a DB fetch instead of throwing). */
async function parseAccessRequestData(request: Request): Promise<unknown> {
  try {
    const body = await request.clone().json()
    return body && typeof body === 'object' ? body : undefined
  } catch {
    return undefined
  }
}

/** `POST /api/<collection>/access/:id?` - `id` is OPTIONAL (real Payload's own route is `/access/:id?`, confirmed in `collections/endpoints/docAccess.js`): the no-id case is how the real admin UI checks "can I create a new one at all" (`fetchData: false` in real Payload). When `id` is present and the POST body carried no usable `data`, this fetches the real doc (`overrideAccess: true`, matching real Payload's own fallback fetch) so field-level access functions that read doc values still see them - see this section's header comment for the one documented `Where`-object fidelity gap. */
async function handleCollectionAccess(engine: Engine, collection: string, id: number | undefined, request: Request, user: unknown): Promise<Response> {
  const config = readRegistry.collections[collection]?.config as unknown as AccessEntityConfigLike
  let data = await parseAccessRequestData(request)
  if (data === undefined && id !== undefined) {
    data = await engine.findByID({ collection, id, overrideAccess: true, user: user as Parameters<Engine['findByID']>[0]['user'] }).catch((): unknown => undefined)
  }
  const result = await getEntityAccessResult(config, collectionAccessOperations(config), id, data, user, engine)
  return Response.json(result, { status: 200 })
}

/** `POST /api/globals/<slug>/access` - globals are singletons, so real Payload always fetches the current doc (`fetchData: true` unconditionally, confirmed in `globals/endpoints/docAccess.js`) unless the POST body already carried usable `data`. */
async function handleGlobalAccess(engine: Engine, globalSlug: string, request: Request, user: unknown): Promise<Response> {
  const config = readRegistry.globals[globalSlug]?.config as unknown as AccessEntityConfigLike
  let data = await parseAccessRequestData(request)
  if (data === undefined) {
    data = await engine.findGlobal({ slug: globalSlug, overrideAccess: true, user: user as Parameters<Engine['findGlobal']>[0]['user'] }).catch((): unknown => undefined)
  }
  const ops = config.versions ? ['read', 'update', 'readVersions'] : ['read', 'update']
  const result = await getEntityAccessResult(config, ops, undefined, data, user, engine)
  return Response.json(result, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* Cart item endpoints (Stage 10 Ecommerce, Layer 2 remainder)                */
/*                                                                            */
/* Reproduced from the real ecommerce plugin's 5 cart endpoints              */
/* (`@payloadcms/plugin-ecommerce@3.88.0`'s `collections/carts/endpoints/*`  */
/* + `collections/carts/operations/*`, read directly from `node_modules` to  */
/* confirm exact request/response shapes, validation messages, and status   */
/* codes below). Simplified for this app's shop config (`engage.config.ts`: */
/* `variants: false`) - no variant matching/spreading, no custom item       */
/* fields (`cartItemFields` in `../features/ecommerce/collections/shared.ts`*/
/* is just `product`/`quantity`).                                           */

type CartItem = { product: number; quantity: number; id?: string }

async function handleAddItem(engine: Engine, cartID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const itemData = data.item as unknown
  const item: CartItem = { product: -1, quantity: 1 }
  if (itemData && typeof itemData === 'object' && typeof (itemData as Record<string, unknown>).product === 'number') {
    item.product = (itemData as Record<string, unknown>).product as number
  } else {
    return Response.json({ success: false, message: 'Item with product ID is required', cart: null }, { status: 400 })
  }

  const quantity = data.quantity
  if (typeof quantity === 'number' && quantity > 0) item.quantity = quantity

  const cart = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown as { items?: unknown[] } | null
  if (!cart) {
    return Response.json({ success: false, message: `Cart with ID ${cartID} not found`, cart: null }, { status: 404 })
  }

  const items = Array.isArray(cart.items) ? [...cart.items] : []
  const existingItem = items.find((i) => (i as Record<string, unknown>).product === item.product)
  if (existingItem) {
    (existingItem as Record<string, unknown>).quantity = ((existingItem as Record<string, unknown>).quantity as number) + item.quantity
  } else {
    items.push(item)
  }

  const updated = (await engine.update({ collection: 'carts', id: cartID, data: { items }, user, req: secretReq(request) }).catch((): unknown => null)) as unknown
  return Response.json({ success: true, message: 'Item added to cart', cart: updated }, { status: 200 })
}

async function handleRemoveItem(engine: Engine, cartID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const itemID = data.itemID
  if (typeof itemID !== 'string') {
    return Response.json({ success: false, message: 'Item ID is required', cart: null }, { status: 400 })
  }

  const cart = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown as { items?: unknown[] } | null
  if (!cart) {
    return Response.json({ success: false, message: `Cart with ID ${cartID} not found`, cart: null }, { status: 404 })
  }

  const items = Array.isArray(cart.items) ? [...cart.items] : []
  const idx = items.findIndex((i) => (i as Record<string, unknown>).id === itemID)
  if (idx === -1) {
    return Response.json({ success: false, message: `Item with ID ${itemID} not found in cart`, cart }, { status: 404 })
  }

  items.splice(idx, 1)
  const updated = (await engine.update({ collection: 'carts', id: cartID, data: { items }, user, req: secretReq(request) }).catch((): unknown => null)) as unknown
  return Response.json({ success: true, message: 'Item removed from cart', cart: updated }, { status: 200 })
}

async function handleUpdateItem(engine: Engine, cartID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const itemID = data.itemID
  const quantityData = data.quantity
  const removeOnZero = data.removeOnZero !== false

  if (typeof itemID !== 'string') {
    return Response.json({ success: false, message: 'Item ID is required', cart: null }, { status: 400 })
  }

  let quantity: number | null = null
  if (typeof quantityData === 'number') {
    quantity = quantityData
  } else if (quantityData && typeof quantityData === 'object' && typeof (quantityData as Record<string, number>).$inc === 'number') {
    // Will compute the actual quantity after fetching the cart
  } else {
    return Response.json({ success: false, message: 'Quantity must be a number or { $inc: number }', cart: null }, { status: 400 })
  }

  const cart = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown as { items?: unknown[] } | null
  if (!cart) {
    return Response.json({ success: false, message: `Cart with ID ${cartID} not found`, cart: null }, { status: 404 })
  }

  const items = Array.isArray(cart.items) ? [...cart.items] : []
  const existingItem = items.find((i) => (i as Record<string, unknown>).id === itemID)
  if (!existingItem) {
    return Response.json({ success: false, message: `Item with ID ${itemID} not found in cart`, cart }, { status: 404 })
  }

  if (quantity === null) {
    // Must be $inc case
    const inc = ((quantityData as Record<string, number>).$inc ?? 0) as number
    quantity = Math.max(1, ((existingItem as Record<string, unknown>).quantity as number) + inc)
  }

  if (removeOnZero && quantity === 0) {
    const idx = items.indexOf(existingItem)
    items.splice(idx, 1)
    const updated = (await engine.update({ collection: 'carts', id: cartID, data: { items }, user, req: secretReq(request) }).catch((): unknown => null)) as unknown
    return Response.json({ success: true, message: 'Item removed from cart', cart: updated }, { status: 200 })
  }

  ;(existingItem as Record<string, unknown>).quantity = Math.max(1, quantity)
  const updated = (await engine.update({ collection: 'carts', id: cartID, data: { items }, user, req: secretReq(request) }).catch((): unknown => null)) as unknown
  return Response.json({ success: true, message: 'Item quantity updated', cart: updated }, { status: 200 })
}

async function handleClearCart(engine: Engine, cartID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const cart = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown as { items?: unknown[] } | null
  if (!cart) {
    return Response.json({ success: false, message: `Cart with ID ${cartID} not found`, cart: null }, { status: 404 })
  }

  const updated = (await engine.update({ collection: 'carts', id: cartID, data: { items: [] }, user, req: secretReq(request) }).catch((): unknown => null)) as unknown
  return Response.json({ success: true, message: 'Cart cleared', cart: updated }, { status: 200 })
}

async function handleMergeCart(engine: Engine, cartID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  if (!user) {
    return Response.json({ success: false, message: 'Authentication required', cart: null }, { status: 401 })
  }

  const { data } = await readRequestBody(request)
  const sourceCartID = data.sourceCartID
  const sourceSecret = data.sourceSecret

  if (typeof sourceCartID !== 'number') {
    return Response.json({ success: false, message: 'Source cart ID is required', cart: null }, { status: 400 })
  }
  if (typeof sourceSecret !== 'string') {
    return Response.json({ success: false, message: 'Source cart secret is required', cart: null }, { status: 400 })
  }

  const sourceCart = (await engine.find({ collection: 'carts', where: { and: [{ id: { equals: sourceCartID } }, { secret: { equals: sourceSecret } }] }, overrideAccess: true, user, pagination: false }).catch((): unknown => ({ docs: [] }))) as unknown as { docs: Array<{ id?: number; items?: unknown[] }> }
  if (!sourceCart.docs || sourceCart.docs.length === 0) {
    return Response.json({ success: false, message: `Source cart with ID ${sourceCartID} not found or secret mismatch`, cart: null }, { status: 404 })
  }

  const targetCart = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown as { items?: unknown[] } | null
  if (!targetCart) {
    return Response.json({ success: false, message: `Target cart with ID ${cartID} not found`, cart: null }, { status: 404 })
  }

  const sourceItems = Array.isArray(sourceCart.docs[0].items) ? sourceCart.docs[0].items : []
  const targetItems = Array.isArray(targetCart.items) ? [...targetCart.items] : []

  for (const sourceItem of sourceItems as unknown[]) {
    const sItem = sourceItem as Record<string, unknown>
    const sourceProduct = sItem.product
    const sourceQty = sItem.quantity as number

    const existingIdx = targetItems.findIndex((t) => (t as Record<string, unknown>).product === sourceProduct)
    if (existingIdx !== -1) {
      ;(targetItems[existingIdx] as Record<string, unknown>).quantity = (((targetItems[existingIdx] as Record<string, unknown>).quantity as number) || 0) + sourceQty
    } else {
      targetItems.push({ product: sourceProduct, quantity: sourceQty })
    }
  }

  const sourceId = sourceCart.docs[0].id
  await engine.update({ collection: 'carts', id: cartID, data: { items: targetItems }, user, req: secretReq(request) }).catch((): unknown => null)
  await engine.delete({ collection: 'carts', id: sourceId as number, overrideAccess: true, user }).catch((): unknown => null)

  const updated = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown
  return Response.json({ success: true, message: `Merged ${sourceItems.length} items from guest cart`, cart: updated }, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* Payments: Stripe cart checkout (Stage 10 Ecommerce, Layer 3)              */
/* -------------------------------------------------------------------------- */

async function handleStripeWebhook(engine: Engine, request: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY

  // Early exit if not configured - matches real handler's shape
  if (!webhookSecret || !stripeSecretKey) {
    return Response.json({ received: true }, { status: 200 })
  }

  // Early exit if no signature header
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return Response.json({ received: true }, { status: 200 })
  }

  try {
    const body = await request.text()
    const StripeClass = await getStripeClient()
    const stripe = new StripeClass({ apiKey: stripeSecretKey })
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)

    // Event-type routing - only handle events we recognize
    if (event.type === 'customer.subscription.deleted') {
      await membershipWebhooks.handleSubscriptionDeleted(event.data.object as Stripe.Event.Data.Object, engine)
    }

    return Response.json({ received: true }, { status: 200 })
  } catch (err) {
    // Bad signature or other webhook error - always return 400/received:true matching real handler
    return Response.json({ received: true }, { status: 400 })
  }
}

async function handleStripeInitiate(engine: Engine, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const cartID = data.cartID as number
  const customerEmail = stringField(data, 'customerEmail')

  if (typeof cartID !== 'number' || cartID <= 0) {
    return Response.json({ message: 'Cart ID is required.' }, { status: 400 })
  }

  if (!user && !customerEmail) {
    return Response.json({ message: 'A customer email is required to make a purchase.' }, { status: 400 })
  }

  const cart = (await engine.findByID({ collection: 'carts', id: cartID, user, req: secretReq(request), overrideAccess: false }).catch((): unknown => null)) as unknown as { items?: unknown[]; currency?: string; subtotal?: number } | null
  if (!cart) {
    return Response.json({ message: `Cart with ID ${cartID} not found.` }, { status: 404 })
  }

  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    return Response.json({ message: 'Cart is required and must contain at least one item.' }, { status: 400 })
  }

  // Validate products exist and have prices
  for (const item of cart.items as unknown[]) {
    const iData = item as Record<string, unknown>
    const productID = iData.product as number
    const product = (await engine.findByID({ collection: 'products', id: productID, user, overrideAccess: false }).catch((): unknown => null)) as unknown as { priceInAUD?: number } | null
    if (!product) {
      return Response.json({ message: `Product with ID ${productID} not found.` }, { status: 404 })
    }
    if (typeof product.priceInAUD !== 'number' || product.priceInAUD <= 0) {
      return Response.json({ message: 'Product does not have a price in AUD.' }, { status: 400 })
    }

    const quantity = iData.quantity as number
    if (product.priceInAUD * quantity < 0) {
      return Response.json({ message: 'Product is out of stock or does not have enough inventory.' }, { status: 400 })
    }
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    return Response.json({ message: 'Stripe is not configured.' }, { status: 500 })
  }

  return await initiateStripePayment(engine, cartID, customerEmail, user, request)
}

async function handleStripeConfirmOrder(engine: Engine, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const cartID = data.cartID as number
  const customerEmail = stringField(data, 'customerEmail')
  const paymentIntentID = stringField(data, 'paymentIntentID')

  if (!paymentIntentID) {
    return Response.json({ message: 'PaymentIntent ID is required' }, { status: 400 })
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    return Response.json({ message: 'Stripe is not configured.' }, { status: 500 })
  }

  return await confirmStripeOrder(engine, cartID, customerEmail, paymentIntentID, user, request)
}

/* -------------------------------------------------------------------------- */
/* Versions endpoints (Stage 7)                                              */
/* -------------------------------------------------------------------------- */

/**
 * All 6 core version endpoints for the 5 versioned collections (posts,
 * pages, events, courses, products) are reproduced here, matching real
 * Payload's wire-for-wire (see `payload/dist/collections/endpoints/
 * {getVersions,getVersionByID,restoreVersion}.js` read directly from
 * `node_modules`, and the plan doc's "REST responses" mapping for field-
 * level naming and status/envelope conventions). Each handler validates
 * collection/id/version-id existence before operating (real Payload's own
 * pattern confirmed by reading), and returns the same error envelopes
 * (`errorToResponse` above).
 */

async function handleGetVersions(engine: Engine, collection: string, id: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const entry = versionsRegistry.findByID(collection)
  if (!entry) return null // Fallthrough to real Payload
  const result = await entry.ops.findVersions({ id, limit: query.limit, page: query.page, sort: query.sort, pagination: query.pagination, user, overrideAccess: false })
  return Response.json(result, { status: 200 })
}

async function handleGetVersionByID(engine: Engine, collection: string, id: number, versionID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const entry = versionsRegistry.findByID(collection)
  if (!entry) return null // Fallthrough to real Payload
  const doc = await entry.ops.findVersionByID({ id, versionID, user, overrideAccess: false })
  return Response.json(doc, { status: 200 })
}

async function handleRestoreVersion(engine: Engine, collection: string, id: number, versionID: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const entry = versionsRegistry.findByID(collection)
  if (!entry) return null // Fallthrough to real Payload
  const doc = await entry.ops.restoreVersion({ id, versionID, user, overrideAccess: false })
  return Response.json({ doc, message: 'Version restored successfully.' }, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* Main handler router                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Reproduces real Payload's own REST request routing (see `payload/dist/
 * collections/endpoints/handleEndpoints.js` and equivalent globals handler,
 * read directly from `node_modules`). Matches a request path against the
 * registered collection/global slugs, branching on method + remaining path
 * segments. Returns a real `Response` for anything handled, or `null` to
 * signal "not handled here, fall through to real Payload's REST".
 *
 * Call signature is `handleRestRequest(request, pathSegments, engine,
 * testEngine?)` - a third `testEngine` parameter is ONLY for unit tests to
 * inject a mocked engine without the real DB attached. Omit it in
 * production.
 */
export async function handleRestRequest(request: Request, pathSegments: string[], engine: Engine): Promise<Response | null> {
  const method = request.method
  const [rootOrCollection, ...rest] = pathSegments

  // Fallthrough for empty/unrecognized root
  if (!rootOrCollection) return null

  // /api/access (root)
  if (rootOrCollection === 'access' && rest.length === 0 && method === 'GET') {
    return handleAccessRoot(engine, (await engine.auth({ data: {}, request })).user)
  }

  // /api/globals/:slug or /api/globals/:slug/access
  if (rootOrCollection === 'globals') {
    const [globalSlug, ...globalRest] = rest
    if (!globalSlug) return null

    if (globalRest.length === 0 && method === 'GET') {
      const user = (await engine.auth({ data: {}, request })).user
      return handleFindGlobal(engine, globalSlug, request, user)
    }
    if (globalRest.length === 0 && method === 'POST') {
      const user = (await engine.auth({ data: {}, request })).user
      return handleUpdateGlobal(engine, globalSlug, request, user)
    }
    if (globalRest.length === 1 && globalRest[0] === 'access' && method === 'POST') {
      const user = (await engine.auth({ data: {}, request })).user
      return handleGlobalAccess(engine, globalSlug, request, user)
    }
    return null
  }

  // /api/payments/...
  if (rootOrCollection === 'payments') {
    const [provider, ...paymentRest] = rest
    if (provider === 'stripe' && paymentRest[0] === 'webhooks' && method === 'POST') {
      return handleStripeWebhook(engine, request)
    }
    if (provider === 'stripe' && paymentRest[0] === 'initiate' && method === 'POST') {
      const user = (await engine.auth({ data: {}, request })).user
      return handleStripeInitiate(engine, request, user)
    }
    if (provider === 'stripe' && paymentRest[0] === 'confirm-order' && method === 'POST') {
      const user = (await engine.auth({ data: {}, request })).user
      return handleStripeConfirmOrder(engine, request, user)
    }
    return null
  }

  // /api/<collection> or /api/<collection>/... handlers
  const user = (await engine.auth({ data: {}, request })).user

  // Verify it's a registered collection
  if (!readRegistry.collections[rootOrCollection]) return null

  // /api/<collection> or /api/<collection>/ - list/create/count
  if (rest.length === 0) {
    if (method === 'GET') return handleFind(engine, rootOrCollection, request, user)
    if (method === 'POST') return handleCreate(engine, rootOrCollection, request, user)
    if (method === 'PATCH') return handleBulkUpdate(engine, rootOrCollection, request, user)
    if (method === 'DELETE') return handleBulkDelete(engine, rootOrCollection, request, user)
    return null
  }

  // Parse first segment after collection
  const [firstSegment, ...afterFirst] = rest
  const numericID = /^\d+$/.test(firstSegment) ? parseInt(firstSegment, 10) : null

  // /api/<collection>/:id routes (must be numeric)
  if (numericID !== null) {
    // /api/<collection>/:id
    if (afterFirst.length === 0) {
      if (method === 'GET') return handleFindByID(engine, rootOrCollection, numericID, request, user)
      if (method === 'PATCH') return handleUpdateByID(engine, rootOrCollection, numericID, request, user)
      if (method === 'DELETE') return handleDeleteByID(engine, rootOrCollection, numericID, user, request)
      return null
    }

    // /api/<collection>/:id/<subpath>
    const [subpath, ...afterSubpath] = afterFirst

    // /api/<collection>/:id/duplicate
    if (subpath === 'duplicate' && afterSubpath.length === 0 && method === 'POST') {
      return handleDuplicate(engine, rootOrCollection, numericID, request, user)
    }

    // /api/<collection>/:id/access
    if (subpath === 'access' && afterSubpath.length === 0 && method === 'POST') {
      return handleCollectionAccess(engine, rootOrCollection, numericID, request, user)
    }

    // /api/<collection>/:id/versions or /api/<collection>/:id/versions/:versionID
    if (subpath === 'versions') {
      if (afterSubpath.length === 0 && method === 'GET') {
        return handleGetVersions(engine, rootOrCollection, numericID, request, user)
      }
      if (afterSubpath.length === 1 && /^\d+$/.test(afterSubpath[0])) {
        const versionID = parseInt(afterSubpath[0], 10)
        if (method === 'GET') {
          return handleGetVersionByID(engine, rootOrCollection, numericID, request, user)
        }
        if (method === 'POST') {
          return handleRestoreVersion(engine, rootOrCollection, numericID, versionID, request, user)
        }
      }
      return null
    }

    // Cart-specific sub-routes (/api/carts/:id/add-item, etc.)
    if (rootOrCollection === 'carts') {
      if (subpath === 'add-item' && afterSubpath.length === 0 && method === 'POST') {
        return handleAddItem(engine, numericID, request, user)
      }
      if (subpath === 'remove-item' && afterSubpath.length === 0 && method === 'POST') {
        return handleRemoveItem(engine, numericID, request, user)
      }
      if (subpath === 'update-item' && afterSubpath.length === 0 && method === 'POST') {
        return handleUpdateItem(engine, numericID, request, user)
      }
      if (subpath === 'clear' && afterSubpath.length === 0 && method === 'POST') {
        return handleClearCart(engine, numericID, request, user)
      }
      if (subpath === 'merge' && afterSubpath.length === 0 && method === 'POST') {
        return handleMergeCart(engine, numericID, request, user)
      }
    }

    // /api/media/file/:filename
    if (rootOrCollection === 'media' && subpath === 'file' && afterSubpath.length === 1 && method === 'GET') {
      return handleGetMediaFile(afterSubpath[0], request)
    }

    return null
  }

  // Non-numeric :id fallback (including auth routes on `users` collection)
  if (rootOrCollection === AUTH_COLLECTION_SLUG) {
    // Auth endpoints - literal path checks BEFORE numeric :id parsing (real Payload precedence reproduced)
    if (firstSegment === 'login' && afterFirst.length === 0 && method === 'POST') {
      const { data } = await readRequestBody(request)
      const result = await engine.login({ collection: AUTH_COLLECTION_SLUG, data })
      const token = result.token
      const exp = result.exp
      const setCookie = buildAuthCookie(token, result.exp && typeof result.exp === 'number' ? result.exp - Math.floor(Date.now() / 1000) : 7200)
      return Response.json({ message: 'Authentication Passed', user: result.user, token, exp }, { status: 200, headers: { 'Set-Cookie': setCookie } })
    }
    if (firstSegment === 'logout' && afterFirst.length === 0 && method === 'POST') {
      const { message } = await engine.logout({ collection: AUTH_COLLECTION_SLUG })
      const expiredCookie = buildExpiredAuthCookie()
      return Response.json({ message }, { status: 200, headers: { 'Set-Cookie': expiredCookie } })
    }
    if (firstSegment === 'me' && afterFirst.length === 0 && method === 'GET') {
      const token = extractTokenFromRequest(request)
      const result = await engine.auth({ data: { token }, request })
      if (!result.user) {
        const { status, body } = errorToResponse(new AuthenticationError())
        return Response.json(body, { status })
      }
      const exp = decodeJwtExpUnsafe(token ?? '')
      return Response.json({ ...result.user, token, exp }, { status: 200 })
    }
    if (firstSegment === 'refresh-token' && afterFirst.length === 0 && method === 'POST') {
      const token = extractTokenFromRequest(request)
      const result = await engine.refreshToken({ collection: AUTH_COLLECTION_SLUG, token: token ?? '' })
      const setCookie = result.setCookie ? buildAuthCookie(result.token, result.exp - Math.floor(Date.now() / 1000)) : undefined
      const headers = setCookie ? { 'Set-Cookie': setCookie } : {}
      return Response.json({ message: 'Token refreshed', token: result.token, exp: result.exp, user: result.user }, { status: 200, headers })
    }
    if (firstSegment === 'forgot-password' && afterFirst.length === 0 && method === 'POST') {
      const { data } = await readRequestBody(request)
      const { message } = await engine.forgotPassword({ collection: AUTH_COLLECTION_SLUG, data })
      return Response.json({ message }, { status: 200 })
    }
    if (firstSegment === 'reset-password' && afterFirst.length === 0 && method === 'POST') {
      const { data } = await readRequestBody(request)
      const result = await engine.resetPassword({ collection: AUTH_COLLECTION_SLUG, data })
      const token = result.token
      const exp = result.exp
      const setCookie = buildAuthCookie(token, result.exp && typeof result.exp === 'number' ? result.exp - Math.floor(Date.now() / 1000) : 7200)
      return Response.json({ message: 'Password reset successfully', user: result.user, token, exp }, { status: 200, headers: { 'Set-Cookie': setCookie } })
    }
    if (firstSegment === 'unlock' && afterFirst.length === 0 && method === 'POST') {
      const { data } = await readRequestBody(request)
      await engine.unlock({ collection: AUTH_COLLECTION_SLUG, data })
      return Response.json({ message: 'Account unlocked successfully' }, { status: 200 })
    }
    if (firstSegment === 'access' && afterFirst.length === 0 && method === 'POST') {
      return handleCollectionAccess(engine, AUTH_COLLECTION_SLUG, undefined, request, user)
    }
  }

  // /api/<collection>/access (no id)
  if (firstSegment === 'access' && afterFirst.length === 0 && method === 'POST') {
    return handleCollectionAccess(engine, rootOrCollection, undefined, request, user)
  }

  return null
}

// Additional exports for Stage 7: handle versions registry + corresponding ops collections
export { versionsRegistry }

// Global find/update handlers (Stage 7 addition, needed by /api/globals/:slug routes above)
async function handleFindGlobal(engine: Engine, slug: string, request: Request, user: Parameters<Engine['findGlobal']>[0]['user']): Promise<Response> {
  const doc = await engine.findGlobal({ slug, user, overrideAccess: false })
  return Response.json(doc, { status: 200 })
}

async function handleUpdateGlobal(engine: Engine, slug: string, request: Request, user: Parameters<Engine['findGlobal']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const doc = await engine.updateGlobal({ slug, data, user })
  return Response.json({ message: 'Updated successfully', result: doc }, { status: 200 })
}
