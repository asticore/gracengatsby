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
 * still deferred (bulk operations, versions/drafts, duplicate, `/access`,
 * locked-documents/preferences, GraphQL, and any collection/global this
 * module doesn't recognize).
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
 * Bulk update/delete (`PATCH /`/`DELETE /` with no id - confirmed unused in
 * this app since Stage 1); versions/drafts endpoints and document
 * duplication; the admin panel's own locked-documents/preferences CRUD;
 * `/api/access`/`/api/<collection>/access/:id?`; GraphQL. A request that
 * matches a recognized collection/global slug but not one of the routes
 * this module implements (any of the above) returns `null` from
 * `handleRestRequest`, the same as a request for a collection/global slug
 * this module doesn't recognize at all.
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
import { NotFound as OperationsNotFound, ValidationError } from './operations'
import { parseSearchParams } from './queryParser'
import { NotFound as ReadNotFound } from './read-operations'
import { readRegistry } from './registry'
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

async function handleFind(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const result = await engine.find({ collection, where: query.where as Where | undefined, sort: query.sort, limit: query.limit, page: query.page, pagination: query.pagination, depth: query.depth, user })
  return Response.json(result, { status: 200 })
}

async function handleFindByID(engine: Engine, collection: string, id: number, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const doc = await engine.findByID({ collection, id, depth: query.depth, draft: query.draft, user })
  return Response.json(doc, { status: 200 })
}

async function handleCount(engine: Engine, collection: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const result = await engine.count({ collection, where: query.where as Where | undefined, user })
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
  const doc = await engine.update({ collection, id, data, draft: query.draft, user, file })
  return Response.json({ doc, message: 'Updated successfully.' }, { status: 200 })
}

/** `GET /api/media/file/:filename` - real Payload's own `getFile.js` handler, reproduced for this app's one upload collection. No access check here: see `./storage.ts`'s own header for why `media`'s unconditional `access.read: () => true` means real Payload's own `checkFileAccess` short-circuits to "allowed, no doc lookup" for it. `getMediaObjectResponse` does the actual R2 fetch/range/headers work; this handler only maps its `null` ("no such object") to a 404 in this module's own error-envelope shape. */
async function handleGetMediaFile(filename: string, request: Request): Promise<Response> {
  const response = await getMediaObjectResponse(filename, request)
  if (!response) return Response.json({ errors: [{ name: 'NotFound', message: 'Not Found' }] }, { status: 404 })
  return response
}

async function handleDeleteByID(engine: Engine, collection: string, id: number, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const doc = await engine.delete({ collection, id, user })
  return Response.json({ doc, message: 'Deleted successfully.' }, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* Global handlers                                                            */
/* -------------------------------------------------------------------------- */

async function handleGlobalFind(engine: Engine, slug: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const doc = await engine.findGlobal({ slug, depth: query.depth, user })
  return Response.json(doc, { status: 200 })
}

/** Real global update is `POST /`, not `PATCH /`, and its response key is `result`, not `doc` - see this file's header. */
async function handleGlobalUpdate(engine: Engine, slug: string, request: Request, user: Parameters<Engine['find']>[0]['user']): Promise<Response> {
  const { data } = await readRequestBody(request)
  const result = await engine.updateGlobal({ slug, data, user })
  return Response.json({ message: 'Updated successfully.', result }, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* Auth handlers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `POST /login` - real shape `{message: 'Authentication Passed', user, token, exp}` plus a `Set-Cookie` (`auth/endpoints/login.js`, `translations/languages/en.js`'s `authentication:passed`). A failed login throws `AuthenticationError`/`LockedAuth` from `./auth.ts`'s own `login()`, mapped to 401/423 by `errorToResponse`.
 *
 * **Live-production bug fixed here (2026-09-18)**: this handler used to call
 * `readJsonBody` directly. The admin panel's own login page - like every
 * page built on `@payloadcms/ui`'s generic `<Form>` component - submits as
 * `multipart/form-data` (a `_payload` field holding the JSON-stringified
 * `{email, password}`), never `application/json` - see `readRequestBody`'s
 * own doc comment for the full citation. `request.json()` on a multipart
 * body throws, which surfaced to a real user as a bare, unmapped 500 - easily
 * mistaken for "wrong email or password" since the admin UI's generic error
 * toast doesn't distinguish a thrown network error from a real 401. Every
 * admin-panel login attempt was broken by this from the moment Stage 7's
 * flip made this handler the live one, until this fix.
 */
async function handleLogin(engine: Engine, collection: string, request: Request): Promise<Response> {
  const { data } = await readRequestBody(request)
  const result = await engine.login({ collection, data: { email: stringField(data, 'email'), password: stringField(data, 'password') } })
  const headers = new Headers()
  if (result.token) headers.set('Set-Cookie', buildAuthCookie(result.token, 7200))
  return Response.json({ message: 'Authentication Passed', ...result }, { status: 200, headers })
}

/** `POST /logout` - `{message: 'Logout successful.'}` plus an expired `Set-Cookie` (`auth/endpoints/logout.js`, `authentication:logoutSuccessful`). This app's own `./auth.ts`'s `logout()` never throws (an already-invalid/missing token is a no-op success, by design - see its own doc comment), so there is no failure branch to reproduce from real Payload's own `error:logoutFailed` 400 case. */
async function handleLogout(engine: Engine, collection: string, request: Request): Promise<Response> {
  const url = new URL(request.url)
  await engine.logout({ collection, headers: request.headers, allSessions: url.searchParams.get('allSessions') === 'true' })
  const headers = new Headers()
  headers.set('Set-Cookie', buildExpiredAuthCookie())
  return Response.json({ message: 'Logout successful.' }, { status: 200, headers })
}

/** `GET /me` - `{user, message: 'Account'}`, plus `token`/`exp` when authenticated (`auth/endpoints/me.js`, `authentication:account`). Built from `engine.auth()` (this module's own equivalent of real Payload's strategy-already-ran `req.user`) rather than a dedicated `engine.me()` - no such member exists on `Engine` (see `./engine.ts`'s own confirmed 16-member interface), and `verifyAuth`'s own return value is already exactly what real `meOperation` computes for `result.user` in the one-token-one-collection case this app has. */
async function handleMe(engine: Engine, request: Request): Promise<Response> {
  const { user } = await engine.auth({ headers: request.headers })
  const body: Record<string, unknown> = { user, message: 'Account' }
  if (user) {
    // Real `meOperation` always sets these two once `req.user` is present
    // (`result.collection = req.user.collection`, `result.strategy =
    // req.user._strategy`) - unconditional, unlike `token`/`exp` below.
    body.collection = AUTH_COLLECTION_SLUG
    body.strategy = 'local-jwt'
    const token = extractTokenFromRequest(request)
    if (token) {
      body.token = token
      const exp = decodeJwtExpUnsafe(token)
      if (exp !== null) body.exp = exp
    }
  }
  return Response.json(body, { status: 200 })
}

/** `POST /refresh-token` - `{message: 'Token refresh successful.', exp, refreshedToken, setCookie, strategy, user}` plus a `Set-Cookie` when `setCookie` is true (`auth/endpoints/refresh.js`, `authentication:tokenRefreshSuccessful`). `Engine['refreshToken']`'s own return field is named `token` (this app's own naming, confirmed in `./engine.ts`), renamed to the real wire field `refreshedToken` here - the one field-name translation this handler does between the engine layer and the real REST wire shape. `strategy` is always the literal `'local-jwt'` for a password-based session, matching real Payload's own `_strategy` value confirmed throughout Stage 7's ground-truth research. */
async function handleRefreshToken(engine: Engine, collection: string, request: Request): Promise<Response> {
  const result = await engine.refreshToken({ collection, headers: request.headers })
  const headers = new Headers()
  if (result.setCookie) headers.set('Set-Cookie', buildAuthCookie(result.token, 7200))
  return Response.json({ message: 'Token refresh successful.', exp: result.exp, refreshedToken: result.token, setCookie: result.setCookie, strategy: 'local-jwt', user: result.user }, { status: 200, headers })
}

/** `POST /forgot-password` - always `{message: 'Success'}` at 200, whether or not the email matches a real user (real Payload's own `forgotPasswordHandler` never branches on the operation's own result - by design, so a caller can't use this endpoint to enumerate valid emails; `./auth.ts`'s own `forgotPassword()` already returns `null` rather than throwing for an unknown email, matching this). */
async function handleForgotPassword(engine: Engine, collection: string, request: Request): Promise<Response> {
  const { data } = await readRequestBody(request)
  await engine.forgotPassword({ collection, data: { email: stringField(data, 'email') } })
  return Response.json({ message: 'Success' }, { status: 200 })
}

/** `POST /reset-password` - `{message: 'Password reset successfully.', user, token}` plus a `Set-Cookie` (`auth/endpoints/resetPassword.js`, `authentication:passwordResetSuccessfully`). An invalid/expired token throws `InvalidResetToken` (400, via `errorToResponse`). */
async function handleResetPassword(engine: Engine, collection: string, request: Request): Promise<Response> {
  const { data } = await readRequestBody(request)
  const result = await engine.resetPassword({ collection, data: { password: stringField(data, 'password'), token: stringField(data, 'token') } })
  const headers = new Headers()
  headers.set('Set-Cookie', buildAuthCookie(result.token, 7200))
  return Response.json({ message: 'Password reset successfully.', user: result.user, token: result.token }, { status: 200, headers })
}

/**
 * `POST /unlock` - always `{message: 'Success'}` at 200 on success
 * (`auth/endpoints/unlock.js`, `general:success`). `./auth.ts`'s own
 * `unlockUser()` throws `AuthenticationError` for an unknown email (401, via
 * `errorToResponse`) and a bare `Error` for a missing email (falls through
 * `errorToResponse`'s generic 500 case - a documented, minor gap: real
 * Payload's own equivalent validation failure would be a 400, not a 500, but
 * this is only reachable via a malformed request with no email field at all,
 * not a real client flow).
 *
 * **Access check, added after a real-Payload REST parity test caught its
 * absence**: `unlockOperation` (`auth/operations/unlock.js`) runs
 * `executeAccess({req}, collectionConfig.access.unlock)` at the REST layer
 * (unlike this app's own `engine.unlock` Local API wrapper, which - like
 * every other Local API call in this project - defaults `overrideAccess` to
 * bypass it). This app's `users` collection (`src/collections/Users.ts`)
 * does not define its own `access.unlock`, so real Payload's sanitize step
 * fills in its own default, `auth/defaultAccess.js`: `({req:{user}}) =>
 * Boolean(user)` - ANY authenticated user (not admin-only) may unlock ANY
 * account, but an anonymous request is denied with 403. Confirmed
 * empirically: an anonymous `POST /api/users/unlock` against real Payload's
 * own REST route returns 403, not 200. Reproduced here with the same
 * `Boolean(user)` check via `Forbidden`, since `readRegistry`'s narrow
 * `ReadEntityConfig` (`{slug, fields, access?}` - see `./read-operations.ts`)
 * has no generic per-operation access dispatch this handler could otherwise
 * reuse, and `users` is the one hardcoded auth collection anyway.
 */
async function handleUnlock(engine: Engine, collection: string, request: Request): Promise<Response> {
  const { user } = await engine.auth({ headers: request.headers })
  if (!user) throw new Forbidden()
  const { data } = await readRequestBody(request)
  await engine.unlock({ collection, data: { email: stringField(data, 'email') } })
  return Response.json({ message: 'Success' }, { status: 200 })
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                    */
/* -------------------------------------------------------------------------- */

const AUTH_ROUTE_NAMES = new Set(['login', 'logout', 'me', 'refresh-token', 'forgot-password', 'reset-password', 'unlock'])

/**
 * Routes one REST request. `slug` is the same path-segment array a Next.js
 * catch-all route (`[...slug]`) already hands its own route handlers - e.g.
 * `/api/posts/5` -> `['posts', '5']`, `/api/globals/header` ->
 * `['globals', 'header']`. Returns `null` for anything not implemented by
 * this module (an unrecognized collection/global slug, or a recognized one
 * but a route this stage deliberately defers - see this file's header) so a
 * caller (the future hybrid-dispatcher route file) can fall through to real
 * Payload's own REST handlers. `engine` defaults to a freshly-built
 * `createEngine()` (cheap and synchronous, per `./engine.ts`'s own doc
 * comment) but is injectable for tests, the same dependency-injection
 * pattern this module's own dependencies (`./read-operations.ts`'s
 * `find`/`findByID`/etc, `./migrate.ts`'s `runMigrations`) already use.
 */
export async function handleRestRequest(request: Request, slug: string[], engine: Engine = createEngine()): Promise<Response | null> {
  if (!slug || slug.length === 0) return null
  const method = request.method.toUpperCase()

  try {
    if (slug[0] === 'globals') {
      const globalSlug = slug[1]
      const rest = slug.slice(2)
      if (!globalSlug || !readRegistry.globals[globalSlug] || rest.length > 0) return null

      const { user } = await engine.auth({ headers: request.headers })
      if (method === 'GET') return await handleGlobalFind(engine, globalSlug, request, user)
      if (method === 'POST') return await handleGlobalUpdate(engine, globalSlug, request, user)
      return null
    }

    const collectionSlug = slug[0]
    if (!readRegistry.collections[collectionSlug]) return null
    const rest = slug.slice(1)
    const isAuthCollection = collectionSlug === AUTH_COLLECTION_SLUG

    if (rest.length === 0) {
      if (method === 'GET') {
        const { user } = await engine.auth({ headers: request.headers })
        return await handleFind(engine, collectionSlug, request, user)
      }
      if (method === 'POST') {
        const { user } = await engine.auth({ headers: request.headers })
        return await handleCreate(engine, collectionSlug, request, user)
      }
      // Bulk PATCH/DELETE (no id) - confirmed unused in this app, deferred.
      return null
    }

    if (rest.length === 1) {
      const seg = rest[0]

      if (isAuthCollection && method === 'POST' && AUTH_ROUTE_NAMES.has(seg) && seg !== 'me') {
        if (seg === 'login') return await handleLogin(engine, collectionSlug, request)
        if (seg === 'logout') return await handleLogout(engine, collectionSlug, request)
        if (seg === 'refresh-token') return await handleRefreshToken(engine, collectionSlug, request)
        if (seg === 'forgot-password') return await handleForgotPassword(engine, collectionSlug, request)
        if (seg === 'reset-password') return await handleResetPassword(engine, collectionSlug, request)
        if (seg === 'unlock') return await handleUnlock(engine, collectionSlug, request)
      }
      if (isAuthCollection && method === 'GET' && seg === 'me') {
        return await handleMe(engine, request)
      }

      if (method === 'GET' && seg === 'count') {
        const { user } = await engine.auth({ headers: request.headers })
        return await handleCount(engine, collectionSlug, request, user)
      }

      const id = Number(seg)
      if (!Number.isFinite(id)) return null // not a recognized named route or a valid numeric id - fall through

      const { user } = await engine.auth({ headers: request.headers })
      if (method === 'GET') return await handleFindByID(engine, collectionSlug, id, request, user)
      if (method === 'PATCH') return await handleUpdateByID(engine, collectionSlug, id, request, user)
      if (method === 'DELETE') return await handleDeleteByID(engine, collectionSlug, id, user)
      return null
    }

    if (rest.length === 2 && collectionSlug === UPLOAD_COLLECTION_SLUG && rest[0] === 'file' && method === 'GET') {
      return await handleGetMediaFile(decodeURIComponent(rest[1]), request)
    }

    // /versions, /versions/:id, /:id/duplicate, /access/:id? - deferred.
    return null
  } catch (err) {
    const { status, body } = errorToResponse(err)
    return Response.json(body, { status })
  }
}
