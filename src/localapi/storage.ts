/**
 * Uploads stage: a from-scratch replacement for `@payloadcms/storage-r2`
 * (re-exported today as `src/engine/storage.ts`'s `r2Storage`), talking to
 * the same R2 bucket binding directly.
 *
 * GROUND TRUTH, read directly from `node_modules/@payloadcms/storage-r2@
 * 3.88.0/dist/{index,adapter,uploadFile,deleteFile,getFile}.js` and
 * `@payloadcms/plugin-cloud-storage`'s `utilities/getFileKey.js`: this app's
 * own `engage.config.ts` wires the plugin with `{ bucket: cloudflare.env.R2,
 * collections: { media: true } }` - no `prefix` option, and
 * `useCompositePrefixes` defaults false. `getFileKey`'s own resolution
 * (`docPrefix || collectionPrefix`, then joined with the filename) collapses
 * to a bare `filename` for every object this app's `media` collection has
 * ever stored: `docPrefix` comes from a document-level `prefix` field
 * (added by the cloud-storage plugin only when `useCompositePrefixes` or an
 * explicit per-collection `prefix` config asks for it), and `Media.ts`
 * declares neither - confirmed independently by `src/features/backups/
 * export/media.ts`'s own `copyMedia`, which already round-trips this app's
 * real R2 media bucket keyed by nothing but `object.key` with no directory
 * prefix.
 *
 * - Upload: `bucket.put(key, data, {httpMetadata: {contentType}})` -
 *   `uploadFile.js`'s own call, verbatim (the `isMiniflare`-only `Blob` wrap
 *   in the real plugin is an artifact of how ITS OWN caller hands it a
 *   Node `Buffer` off a temp-file read; this module is always handed a
 *   plain `Uint8Array` already, which `R2Bucket.put` accepts directly in
 *   both local `wrangler`/miniflare dev and production, so no such branch
 *   is needed here).
 * - Delete: `bucket.delete(key)` - `deleteFile.js`'s own call, verbatim.
 * - Serve: `getFile.js`'s handler, reproduced narrower - this app's one
 *   upload collection's `access.read` is the unconditional `() => true`
 *   (see `Media.ts`), so real Payload's own `checkFileAccess` (`payload/
 *   dist/uploads/checkFileAccess.js`) never resolves to a `Where`-shaped
 *   constraint for it (`typeof true !== 'object'`) and short-circuits to
 *   "allowed, no doc lookup needed" - confirmed by reading that file
 *   directly. `./rest.ts`'s file-serving route handler is expected to
 *   reproduce that same short-circuit (a hardcoded "media's read access is
 *   always true" fact, same hardcoding convention as everything else
 *   collection-specific in this module family) rather than this module
 *   re-deriving it, so `getMediaObjectResponse` below does no access
 *   checking of its own - it is a pure "stream this R2 key back as a
 *   `Response`" primitive.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { GetPlatformProxyOptions } from 'wrangler'

let cachedBucket: R2Bucket | undefined

/**
 * Resolves the R2 binding the same way `src/cms/db/connect.ts`'s
 * `resolveD1Binding` resolves the D1 binding: `getCloudflareContext()` only
 * works inside the real opennextjs-cloudflare runtime (production, or `next
 * dev`/`wrangler dev`), so everywhere else - the CLI and this app's own
 * vitest suite included - falls back to wrangler's `getPlatformProxy()`
 * against the local emulated R2 bucket. Not the vendor package either way,
 * just the same Cloudflare/Next runtime glue this app already depends on
 * throughout `src/cms/db/connect.ts` and `src/engage.config.ts`.
 */
async function resolveR2Binding(): Promise<R2Bucket> {
  const isProduction = process.env.NODE_ENV === 'production' && !process.env.VITEST
  if (!isProduction) {
    const { getPlatformProxy } = await import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`)
    const proxy = await getPlatformProxy({ environment: process.env.CLOUDFLARE_ENV } satisfies GetPlatformProxyOptions)
    return (proxy.env as { R2: R2Bucket }).R2
  }
  const { env } = await getCloudflareContext({ async: true })
  return env.R2
}

/** Returns the cached (or freshly-resolved) R2 bucket binding this app's media lives in. Exported for tests that need to assert against the bucket directly (matching `getDb`'s own exported-for-tests convention in `src/cms/db/connect.ts`). */
export async function getMediaBucket(): Promise<R2Bucket> {
  if (cachedBucket) return cachedBucket
  cachedBucket = await resolveR2Binding()
  return cachedBucket
}

/** `uploadFile.js`, ported. */
export async function putMediaObject(key: string, data: Uint8Array, contentType: string): Promise<void> {
  const bucket = await getMediaBucket()
  await bucket.put(key, data, { httpMetadata: { contentType } })
}

/** `deleteFile.js`, ported. */
export async function deleteMediaObject(key: string): Promise<void> {
  const bucket = await getMediaBucket()
  await bucket.delete(key)
}

/**
 * Parses a single-range `Range: bytes=start-end` header value into a plain
 * `R2Range` (real Payload's own `parseRangeHeader.js` hand-rolls the same
 * byte math for its own local-disk range serving - this is this module's
 * equivalent, kept small since R2 itself validates/clamps the result).
 * Deliberately returns a plain object rather than passing the `Headers`
 * instance straight through to `R2Bucket.get` (which real production R2
 * also accepts directly, no parsing needed) - wrangler's local dev R2
 * emulation (`getPlatformProxy`, used by this app's own vitest suite and
 * `next dev`) marshals `bucket.get()`'s arguments over an RPC boundary that
 * can't serialize a live `Headers` instance (`devalue`'s own "Cannot
 * stringify arbitrary non-POJOs"), so a plain, structurally-cloneable range
 * object is the one form that works identically in both environments.
 * Multi-range (`bytes=0-10,20-30`) and malformed values are treated as "no
 * range" (a full-object response), matching a permissive fallback rather
 * than a 416 - no real caller of this app's media route sends multi-range
 * requests (confirmed: nothing in `src/` constructs one).
 */
function parseRangeHeader(rangeHeader: string | null): R2Range | undefined {
  if (!rangeHeader) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return undefined
  const [, startText, endText] = match
  if (startText === '' && endText === '') return undefined
  if (startText === '') return { suffix: Number(endText) }
  const offset = Number(startText)
  if (endText === '') return { offset }
  return { offset, length: Number(endText) - offset + 1 }
}

/**
 * `getFile.js`, ported for this app's own single-collection, no-imageSizes,
 * always-public-read shape (see this file's header). Returns `null` when the
 * object doesn't exist (caller maps that to 404) rather than throwing.
 */
export async function getMediaObjectResponse(key: string, request: Request): Promise<Response | null> {
  const bucket = await getMediaBucket()
  const requestedRange = parseRangeHeader(request.headers.get('Range'))
  const object = await bucket.get(key, requestedRange ? { range: requestedRange } : undefined)
  if (!object) return null

  // Set headers from `object.httpMetadata` directly rather than calling
  // `object.writeHttpMetadata(headers)` - the method call works fine
  // against a real binding, but wrangler's local dev proxy (`getPlatformProxy`,
  // used by this app's own vitest suite and `next dev` - see this file's
  // `resolveR2Binding`) marshals R2 objects over an RPC boundary that can't
  // serialize a live `Headers` instance being mutated by a remote method
  // call (`devalue`'s own "Cannot stringify arbitrary non-POJOs"). Reading
  // the plain, structurally-cloneable `httpMetadata` object and setting
  // each header ourselves produces the identical header set without ever
  // needing that method.
  const headers = new Headers()
  const metadata = object.httpMetadata
  if (metadata?.contentType) headers.set('Content-Type', metadata.contentType)
  if (metadata?.contentLanguage) headers.set('Content-Language', metadata.contentLanguage)
  if (metadata?.contentDisposition) headers.set('Content-Disposition', metadata.contentDisposition)
  if (metadata?.contentEncoding) headers.set('Content-Encoding', metadata.contentEncoding)
  if (metadata?.cacheControl) headers.set('Cache-Control', metadata.cacheControl)
  if (metadata?.cacheExpiry) headers.set('Expires', metadata.cacheExpiry.toUTCString())
  headers.set('etag', object.httpEtag)
  headers.set('Accept-Ranges', 'bytes')

  // Gated on `requestedRange` (whether the caller actually asked for a
  // range), not merely on `object.range` being set - wrangler's local dev R2
  // emulation (`getPlatformProxy`, used by this app's own vitest suite and
  // `next dev`) always populates `.range` to the object's full extent even
  // for a plain `bucket.get(key)` with no range requested, unlike real
  // production R2, which leaves it `undefined` in that case (confirmed by
  // direct inspection of a local `getPlatformProxy`-backed bucket). Without
  // this gate, every plain fetch through local dev would incorrectly come
  // back 206 instead of 200.
  const range = requestedRange ? object.range : undefined
  if (range) {
    const start = 'suffix' in range ? object.size - range.suffix : (range.offset ?? 0)
    const length = 'suffix' in range ? range.suffix : (range.length ?? object.size - start)
    const end = start + length - 1
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`)
    headers.set('Content-Length', String(length))
  } else {
    headers.set('Content-Length', String(object.size))
  }

  return new Response(object.body, { headers, status: range ? 206 : 200 })
}
