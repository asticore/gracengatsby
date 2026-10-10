/**
 * Uploads stage: a from-scratch reproduction of the pieces of the reference engine's
 * upload-handling internals (the vendor source) this app's ONE
 * upload-enabled collection (`media`, see `src/collections/Media.ts`) - and
 * only that collection, hardcoded the same way `./rest.ts`'s
 * `AUTH_COLLECTION_SLUG` hardcodes `users` for the one thing that's true
 * about it - actually exercises.
 *
 * SCOPE, confirmed by reading `src/collections/Media.ts` directly: `upload:
 * { crop: false, focalPoint: false }`, no `imageSizes`, no `mimeTypes`
 * restriction, no `allowRestrictedFileTypes`, no `filesRequiredOnCreate`
 * override. That rules out, permanently, for THIS app: sharp/image
 * resizing and its generated `sizes` column, crop/focal-point UI and the
 * `focalX`/`focalY` columns, and the `mimeTypes`-configured branch of real
 * The original engine's own `checkFileRestrictions` (`uploads/checkFileRestrictions.js`)
 * - only its `else` branch (the fixed restricted-extension/mimetype
 * blocklist) ever runs for this collection, so that is the only branch
 * ported below.
 *
 * GROUND TRUTH, read directly from `node_modules/engine@3.88.0/dist/
 * uploads/generateFileData.js` (not from memory): `req.engine.config.sharp`
 * is never configured anywhere in this app (`engage.config.ts` has no
 * `sharp:` key - confirmed by grep, and Media.ts's own comment already
 * explains why: "not supported on Workers yet due to lack of sharp"), so
 * every `if (sharp && ...)` branch in that file is dead code for this app.
 * With `sharp` falsy, the function's real behavior collapses to exactly what
 * `generateUploadFields` below reproduces:
 *   - `mimeType` is taken directly from `file.mimetype` (the caller-supplied
 *     Content-Type of the uploaded part) - NOT sniffed from the file's
 *     buffer contents. Buffer-sniffing (`file-type`'s `fileTypeFromBuffer`)
 *     only happens inside the `if (sharpFile)` branch, which never runs here.
 *   - `filesize` is `file.size` as given, not re-measured.
 *   - width/height are computed via `getImageSize` -> (no sharp, no
 *     tempFilePath on this app's Workers runtime) -> `probeImageSize(file.
 *     data)`, a pure-JS buffer-header prober. The reference engine's own version of
 *     that prober is backed by the `image-dimensions` npm package - this
 *     app's zero-new-runtime-dependencies rule means `probeImageDimensions`
 *     below is a hand-written replacement covering exactly the five
 *     `isImage()` mimetypes this app can plausibly receive (jpeg/png/gif/
 *     webp/svg+xml) rather than that library's full format list (which also
 *     covers bmp/ico/tiff/jxl/avif/heic and others no real upload to this
 *     collection has ever used or is likely to - confirmed nothing in this
 *     app's own asset pipeline produces those). A mimetype outside that
 *     five-format list that still claims to be an image (avif, jxl, ...)
 *     throws, matching the reference engine's own behavior on a genuinely
 *     undecodable image (`probeImageSize.js`'s own "Unsupported image type"
 *     throw) - not a gap this app's real usage has ever hit.
 *   - filename sanitization/dedup is `sanitize-filename` + `getSafeFilename`/
 *     `incrementName`, ported below with the caller supplying the "does a
 *     doc with this filename already exist" check (`filenameExists`) so this
 *     module stays decoubled from the DB layer, matching `./auth.ts`'s own
 *     `AuthDbOps`-injection pattern for the same reason.
 *
 * NOT reproduced, deliberately, because the reference engine's own `generateFileData`
 * never reaches this code path for this app either: `uploadEdits`/crop/
 * focal-point re-upload-from-existing-URL handling (`isDuplicating`/
 * `shouldReupload` - this app has no document-duplication feature wired up
 * yet, an already-parked Stage 7 item), `getExternalFile` (paste-a-URL
 * upload - the reference engine's own `/paste-url` endpoint, never wired into this
 * app's REST layer), and `withMetadata`/EXIF handling (sharp-only).
 */

import { ValidationError } from './operations'

/** Matches the reference engine's Local API `file` option shape (`{name, data, mimetype, size}` - confirmed by reading the vendor source and every real `engine.create({file: ...})` call site in this app's own reference-engine test helpers). `data` is `Uint8Array` rather than a Node `Buffer` so this module has no Node-specific dependency - a real `Buffer` already satisfies `Uint8Array` structurally, so every real caller (Node-based tests included) can pass one unmodified. */
export type UploadFile = {
  data: Uint8Array
  mimetype: string
  name: string
  size: number
}

export type GeneratedUploadFields = {
  filename: string
  mimeType: string
  filesize: number
  width?: number
  height?: number
  originalSize?: number
  optimizedSize?: number
}

/* -------------------------------------------------------------------------- */
/* isImage - the vendor source, verbatim list                  */
/* -------------------------------------------------------------------------- */

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp', 'image/avif'])

/**
 * Lowercases a declared mimetype and drops any `;` parameters (`text/html; charset=utf-8`
 * becomes `text/html`). Every type check in this module compares normalised values.
 */
export function normaliseMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase()
}

/** The reference engine's own `isImage()` list also includes `image/jxl`, which is deliberately not here: there is no decoder for it. AVIF is included; its dimensions are read from the `ispe` box, and an AVIF without one is accepted without width/height (see `generateUploadFields`). */
export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(normaliseMimeType(mimeType))
}

/* -------------------------------------------------------------------------- */
/* checkFileRestrictions - the vendor source's   */
/* `else` branch only (see this file's header - the `mimeTypes`-configured    */
/* branch is dead code for this app's one upload collection)                  */
/* -------------------------------------------------------------------------- */

/** Verbatim data port of `RESTRICTED_FILE_EXT_AND_TYPES` (the vendor source) - the fixed blocklist the reference engine checks an upload against when a collection (like this app's `media`) sets no `mimeTypes` allowlist of its own. This is the security-relevant check `src/collections/Media.ts`'s own access-control comment already flags the stakes of (a stored-XSS vector via an uploaded SVG/HTML file served back from this origin) - closing this gap is as much a part of "replace the original engine's upload handling" as the metadata computation is. */
const RESTRICTED_FILE_EXT_AND_TYPES: Array<{ extensions: string[]; mimeType: string }> = [
  { extensions: ['exe', 'dll'], mimeType: 'application/x-msdownload' },
  { extensions: ['exe', 'com', 'app', 'action'], mimeType: 'application/x-executable' },
  { extensions: ['bat', 'cmd'], mimeType: 'application/x-msdos-program' },
  { extensions: ['exe', 'com'], mimeType: 'application/x-ms-dos-executable' },
  { extensions: ['dmg'], mimeType: 'application/x-apple-diskimage' },
  { extensions: ['deb'], mimeType: 'application/x-debian-package' },
  { extensions: ['rpm'], mimeType: 'application/x-redhat-package-manager' },
  { extensions: ['exe', 'dll'], mimeType: 'application/vnd.microsoft.portable-executable' },
  { extensions: ['msi'], mimeType: 'application/x-msi' },
  { extensions: ['jar', 'ear', 'war'], mimeType: 'application/java-archive' },
  { extensions: ['desktop'], mimeType: 'application/x-desktop' },
  { extensions: ['cpl'], mimeType: 'application/x-cpl' },
  { extensions: ['lnk'], mimeType: 'application/x-ms-shortcut' },
  { extensions: ['pkg'], mimeType: 'application/x-apple-installer' },
  { extensions: ['htm', 'html', 'shtml', 'xhtml'], mimeType: 'text/html' },
  { extensions: ['php', 'phtml'], mimeType: 'application/x-httpd-php' },
  { extensions: ['js', 'jse'], mimeType: 'text/javascript' },
  { extensions: ['jsp'], mimeType: 'application/x-jsp' },
  { extensions: ['py'], mimeType: 'text/x-python' },
  { extensions: ['rb'], mimeType: 'text/x-ruby' },
  { extensions: ['pl'], mimeType: 'text/x-perl' },
  { extensions: ['ps1', 'psc1', 'psd1', 'psh', 'psm1'], mimeType: 'application/x-powershell' },
  { extensions: ['vbe', 'vbs'], mimeType: 'application/x-vbscript' },
  { extensions: ['ws', 'wsc', 'wsf', 'wsh'], mimeType: 'application/x-ms-wsh' },
  { extensions: ['scr'], mimeType: 'application/x-msdownload' },
  { extensions: ['asp', 'aspx'], mimeType: 'application/x-asp' },
  { extensions: ['hta'], mimeType: 'application/x-hta' },
  { extensions: ['reg'], mimeType: 'application/x-registry' },
  { extensions: ['url'], mimeType: 'application/x-url' },
  { extensions: ['workflow'], mimeType: 'application/x-workflow' },
  { extensions: ['command'], mimeType: 'application/x-command' },
]

/**
 * Markup and script-capable types. Served back from this origin they can run
 * script, so they are refused whatever the browser says they are - an SVG is
 * the same risk as an HTML page. This is a deliberate deny, not a side effect
 * of the blocklist above.
 */
const DENIED_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'image/svg+xml'])
const DENIED_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'xml', 'svg', 'svgz'])

/** The extension of a filename, lowercased, with any `?query` cut off. Empty when there is none. */
function extensionOf(name: string): string {
  if (!name.includes('.')) return ''
  return (name.split('.').pop() ?? '').split('?')[0].toLowerCase()
}

/** Refuses a file whose normalised mimetype or extension is on a blocklist. `mimeType` must already be normalised. */
function checkRestrictedFileType(name: string, mimeType: string): void {
  const ext = extensionOf(name)
  const isRestricted =
    DENIED_MIME_TYPES.has(mimeType) ||
    DENIED_EXTENSIONS.has(ext) ||
    RESTRICTED_FILE_EXT_AND_TYPES.some(({ extensions, mimeType: restricted }) => extensions.includes(ext) || restricted === mimeType)
  if (isRestricted) {
    throw new ValidationError([
      {
        path: 'file',
        message: `File type '${mimeType}' not allowed for ${name}: restricted file type detected -- set 'allowRestrictedFileTypes' to true to skip this check for this collection.`,
      },
    ])
  }
}

/* -------------------------------------------------------------------------- */
/* Filename sanitization/dedup - `sanitize-filename` + `getSafeFilename.js`    */
/* -------------------------------------------------------------------------- */

/**
 * Hand-rolled equivalent of the `sanitize-filename` npm package's default
 * export (the reference engine's own dependency, `uploads/generateFileData.js`'s
 * `import sanitize from 'sanitize-filename'`) - kept here rather than added
 * as a new runtime dependency, per this project's standing zero-new-deps
 * rule. Reproduces the load-bearing part (stripping filesystem-illegal and
 * control characters, so a filename can never smuggle a path separator into
 * the R2 object key or the served `/api/media/file/:filename` route) and
 * skips the package's Windows-reserved-device-name rule (`CON`, `PRN`,
 * `NUL`, ...) - irrelevant on this app's actual runtime (Cloudflare
 * Workers/R2, never a Windows filesystem) and never exercised by any real
 * upload this app has stored.
 */
function sanitizeFilename(input: string): string {
  return input
    .replace(/[/?<>\\:*|":]/g, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/^\.+$/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 255)
}

/**
 * Verbatim port of `incrementName` (the vendor source)
 * - including its quirk for an extensionless filename (`name.split('.').pop()`
 * returns the whole name as "the extension" when there is no dot), kept
 * faithfully rather than "fixed" since matching the reference engine's own dedup
 * sequence exactly is the point.
 */
export function incrementName(name: string): string {
  const extension = name.split('.').pop() ?? ''
  const baseFilename = sanitizeFilename(name.substring(0, name.lastIndexOf('.')) || name)
  const found = baseFilename.match(/(.*)-(\d+)$/)
  const incrementedName = found === null ? `${baseFilename}-1` : `${found[1]}-${Number(found[2]) + 1}`
  return `${incrementedName}.${extension}`
}

/* -------------------------------------------------------------------------- */
/* Image dimension probing - the vendor source         */
/* equivalent, hand-written (see this file's header for why)                  */
/* -------------------------------------------------------------------------- */

export type ImageDimensions = { width: number; height: number }

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0)
  return out
}

/** PNG: fixed 8-byte signature, then the IHDR chunk's width/height as two big-endian uint32s at a fixed offset (length+type always precede it in a valid PNG). */
function probePng(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) if (bytes[i] !== signature[i]) return null
  const dv = view(bytes)
  return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) }
}

/** GIF87a/GIF89a: 6-byte header, then the Logical Screen Descriptor's width/height as two little-endian uint16s. */
function probeGif(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null
  const header = asciiAt(bytes, 0, 6)
  if (header !== 'GIF87a' && header !== 'GIF89a') return null
  const dv = view(bytes)
  return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) }
}

/** JPEG: walk the marker segments from the SOI until a Start-Of-Frame marker (0xC0-0xCF, excluding the DHT/JPG/DAC markers 0xC4/0xC8/0xCC, which share that range but aren't SOF), whose engine starts with 1 byte of precision then big-endian uint16 height, uint16 width. */
function probeJpeg(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const dv = view(bytes)
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = bytes[offset + 1]
    // Markers with no length/engine of their own.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    if (offset + 4 > bytes.length) break
    const segmentLength = dv.getUint16(offset + 2, false)
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      if (offset + 9 > bytes.length) return null
      return { height: dv.getUint16(offset + 5, false), width: dv.getUint16(offset + 7, false) }
    }
    offset += 2 + segmentLength
  }
  return null
}

/** WebP: a RIFF/WEBP container around one of three sub-formats, each with its own dimension encoding - lossy (`VP8 `, a VP8 key frame's 3-byte start code then two little-endian 14-bit fields), lossless (`VP8L`, a packed 4-byte bitstream of two 14-bit-minus-one fields), or extended (`VP8X`, an explicit 24-bit-minus-one canvas width/height pair). Offsets below are absolute into the whole buffer: 12 bytes of RIFF header + 8 bytes of the sub-chunk's own fourCC+size precede each sub-format's engine at offset 20. */
function probeWebp(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null
  if (asciiAt(bytes, 0, 4) !== 'RIFF' || asciiAt(bytes, 8, 4) !== 'WEBP') return null
  const dv = view(bytes)
  const fourCC = asciiAt(bytes, 12, 4)
  if (fourCC === 'VP8 ') {
    return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff }
  }
  if (fourCC === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null
    const b0 = bytes[21]
    const b1 = bytes[22]
    const b2 = bytes[23]
    const b3 = bytes[24]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (fourCC === 'VP8X') {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    }
  }
  return null
}

/** SVG: attribute-level reading, not real decoding (an SVG's "dimensions" are a document property, not pixel data) - the root `<svg>` tag's own `width`/`height` attributes first, `viewBox`'s trailing width/height numbers as a fallback (matching how a browser sizes an un-styled SVG when only a viewBox is given). Percentage/unit-suffixed dimensions (`width="100%"`) are read as their bare numeric prefix, same limitation the reference engine's own `image-dimensions`-backed prober has for SVG. */
function probeSvg(bytes: Uint8Array): ImageDimensions | null {
  const text = new TextDecoder('utf-8').decode(bytes)
  const tagMatch = /<svg\b[^>]*>/i.exec(text)
  if (!tagMatch) return null
  const tag = tagMatch[0]
  const widthMatch = /\bwidth\s*=\s*"([\d.]+)/i.exec(tag)
  const heightMatch = /\bheight\s*=\s*"([\d.]+)/i.exec(tag)
  if (widthMatch && heightMatch) {
    return { width: Math.round(parseFloat(widthMatch[1])), height: Math.round(parseFloat(heightMatch[1])) }
  }
  const viewBoxMatch = /\bviewBox\s*=\s*"\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i.exec(tag)
  if (viewBoxMatch) {
    return { width: Math.round(parseFloat(viewBoxMatch[1])), height: Math.round(parseFloat(viewBoxMatch[2])) }
  }
  return null
}

/** AVIF: the image's pixel size is in an `ispe` (image spatial extents) item property box inside the file's `meta` box, which sits near the start of the file. Its layout is size(4) 'ispe' version/flags(4) width(4) height(4), so the width and height follow the fourCC at +8 and +12. */
function probeAvif(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 32 || asciiAt(bytes, 4, 4) !== 'ftyp') return null
  const dv = view(bytes)
  // Scans up to the last offset at which a whole ispe box (16 bytes) still fits.
  const limit = Math.min(bytes.length - 15, 8192)
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x69 && bytes[i + 1] === 0x73 && bytes[i + 2] === 0x70 && bytes[i + 3] === 0x65) {
      return { width: dv.getUint32(i + 8, false), height: dv.getUint32(i + 12, false) }
    }
  }
  return null
}

/** Throws (matching real `probeImageSize.js`'s own "Unsupported image type" throw, via `generateFileData.js`'s enclosing try/catch) rather than returning a partial/zero result, since a stored media doc with an image mimetype and no width/height would be a silent data-quality regression no caller of this collection expects. */
export function probeImageDimensions(data: Uint8Array, mimeType: string): ImageDimensions {
  let result: ImageDimensions | null = null
  const type = normaliseMimeType(mimeType)
  if (type === 'image/png') result = probePng(data)
  else if (type === 'image/gif') result = probeGif(data)
  else if (type === 'image/jpeg') result = probeJpeg(data)
  else if (type === 'image/webp') result = probeWebp(data)
  else if (type === 'image/svg+xml') result = probeSvg(data)
  else if (type === 'image/avif') result = probeAvif(data)
  if (!result || !result.width || !result.height) {
    throw new ValidationError([{ path: 'file', message: 'Unsupported image type: unable to determine dimensions.' }])
  }
  return result
}

/* -------------------------------------------------------------------------- */
/* generateUploadFields - the orchestrator, `generateFileData`'s no-sharp path */
/* -------------------------------------------------------------------------- */

/**
 * Computes the implicit upload columns (`filename`/`mimeType`/`filesize`/
 * `width`/`height`) for one uploaded file, matching the reference engine's own
 * `generateFileData` with `sharp` unconfigured (see this file's header for
 * the full citation). Does NOT write anything - purely a pure function over
 * `file` plus the caller-supplied `filenameExists` predicate (wired by
 * `./engine.ts` to a real `filename` lookup against the `media` collection).
 * Does not compute `url`/`thumbnailURL` - those are this app's own route-
 * shape decisions (`/api/media/file/:filename`, always-null respectively),
 * left to the caller (`./engine.ts`) rather than duplicated here.
 */
export async function generateUploadFields(args: {
  file: UploadFile
  filenameExists: (filename: string) => Promise<boolean>
  /**
   * Set by the optimise-on-upload hook (see src/features/media/uploadHook.ts)
   * when the bytes in `file` were re-encoded: `originalSize` is the size the
   * visitor sent, and `optimised` says whether `file` is the smaller copy.
   */
  optimisation?: { originalSize: number; optimised: boolean }
}): Promise<GeneratedUploadFields> {
  const { file, filenameExists, optimisation } = args

  // The declared type is normalised before any check, so `Text/HTML; charset=utf-8`
  // is judged exactly like `text/html`.
  const mimeType = normaliseMimeType(file.mimetype)
  checkRestrictedFileType(file.name, mimeType)

  // Only letters and digits survive in the extension, so it can never carry a
  // path separator into the stored key.
  const ext = extensionOf(file.name).replace(/[^a-z0-9]/g, '').slice(0, 10)
  const baseFilename = sanitizeFilename(file.name.substring(0, file.name.lastIndexOf('.')) || file.name)
  // A name that sanitises to nothing (`???.jpg`, `..`) has no safe stored form, so it is refused before anything is written.
  if (!baseFilename) {
    throw new ValidationError([{ path: 'file', message: 'This file needs a name that uses letters or numbers.' }])
  }
  let filename = `${baseFilename}${ext ? `.${ext}` : ''}`
  while (await filenameExists(filename)) {
    filename = incrementName(filename)
  }

  const fields: GeneratedUploadFields = { filename, mimeType, filesize: file.size }
  // Every upload records its own size as the original, so the field is always
  // filled in; the optimised size is only recorded when a re-encode happened.
  fields.originalSize = optimisation?.originalSize ?? file.size
  if (optimisation?.optimised) fields.optimizedSize = file.size

  if (isImageMimeType(mimeType)) {
    try {
      const dimensions = probeImageDimensions(file.data, mimeType)
      fields.width = dimensions.width
      fields.height = dimensions.height
    } catch (error) {
      // An AVIF without a readable `ispe` box is still a valid picture; it is
      // stored without dimensions. Every other image type must probe.
      if (mimeType !== 'image/avif') throw error
    }
  }

  return fields
}
