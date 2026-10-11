/**
 * Which files the media library accepts, and how a file is judged.
 *
 * The rules, in order of importance:
 *   1. The browser's declared type is never trusted. A file is accepted only if
 *      its extension is on the allow-list AND its first bytes match that kind
 *      of file ("magic bytes"). The type that is stored and served is the one
 *      this module works out, not the one the browser sent.
 *   2. Markup and script-capable files (HTML, SVG, XML, scripts, executables)
 *      are refused outright. They cannot be enabled from Media settings: the
 *      admin can only choose among the kinds registered below.
 *   3. Archives and Office files are never opened. A ZIP is recognised by its
 *      header only, so a decompression bomb is stored as the small file it is
 *      and is never expanded on the server.
 *   4. Names are cleaned (control characters, bidi tricks, path characters) and
 *      length-limited, and a dangerous extension anywhere in the name refuses
 *      the file, so `report.pdf.exe` and `shell.php.jpg` are both turned away.
 *
 * Pure and dependency-free so the browser, the routes and the engine all use
 * exactly the same rules.
 */

export type FileKind = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'text' | 'archive' | 'audio' | 'video' | 'other'

export type AcceptedType = {
  extension: string
  mimeType: string
  kind: FileKind
  label: string
  /** True when the bytes begin like this kind of file. */
  sniff: (bytes: Uint8Array) => boolean
}

/** Default largest upload. A Worker buffers the whole request in memory and accepts at most 100 MB, so this stays well below. */
export const DEFAULT_MAX_UPLOAD_MB = 25
/** Hard ceiling whatever Media settings says. Anything bigger needs R2 multipart upload, which this library does not do. */
export const MAX_UPLOAD_MB_CEILING = 100
/** Longest base name kept, so the stored name (plus extension) stays well inside filesystem and URL limits. */
export const MAX_BASE_NAME_LENGTH = 120

const ascii = (bytes: Uint8Array, offset: number, text: string): boolean => {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i += 1) if (bytes[offset + i] !== text.charCodeAt(i)) return false
  return true
}
const startsWith = (bytes: Uint8Array, signature: number[]): boolean => signature.every((byte, i) => bytes[i] === byte)

/** True if `needle` occurs anywhere in `bytes` (plain scan, no allocation). */
function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const first = needle.charCodeAt(0)
  const last = bytes.length - needle.length
  for (let i = 0; i <= last; i += 1) {
    if (bytes[i] !== first) continue
    let j = 1
    while (j < needle.length && bytes[i + j] === needle.charCodeAt(j)) j += 1
    if (j === needle.length) return true
  }
  return false
}

const isZip = (b: Uint8Array): boolean => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])
const isOle = (b: Uint8Array): boolean => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
/** An Office Open XML file is a ZIP whose entries include `[Content_Types].xml`. */
const isOoxml = (b: Uint8Array): boolean => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(b, '[Content_Types].xml')

/** Text that opens like a web page, SVG, XML or script is refused even under a text extension. */
const MARKUP_START = /^(?:﻿)?\s*(?:<!doctype|<html|<head|<body|<svg|<script|<\?xml|<\?php|<iframe|<object|<embed|<meta|<link|<style|#!\s*\/)/i

function isPlainText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 8192)
  for (const byte of sample) {
    // NUL or other control bytes (except tab, LF, FF, CR) mean this is binary data.
    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13)) return false
  }
  const text = new TextDecoder('utf-8').decode(sample.subarray(0, 512))
  return !MARKUP_START.test(text)
}

const isMp3 = (b: Uint8Array): boolean => ascii(b, 0, 'ID3') || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)
const isWav = (b: Uint8Array): boolean => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')
const isQuickTime = (b: Uint8Array): boolean => ascii(b, 4, 'ftypqt') || ['moov', 'wide', 'mdat', 'free', 'skip'].some((atom) => ascii(b, 4, atom))
const isMp4 = (b: Uint8Array): boolean => ascii(b, 4, 'ftyp') && !ascii(b, 4, 'ftypqt')
const isWebm = (b: Uint8Array): boolean => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])

const OOXML = 'application/vnd.openxmlformats-officedocument'

/**
 * Everything the library can accept. `ACCEPTED_TYPES` is the whole menu; Media
 * settings picks a subset of these extensions. Not listed means refused.
 */
export const ACCEPTED_TYPES: AcceptedType[] = [
  { extension: 'jpg', mimeType: 'image/jpeg', kind: 'image', label: 'JPEG picture', sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { extension: 'jpeg', mimeType: 'image/jpeg', kind: 'image', label: 'JPEG picture', sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { extension: 'png', mimeType: 'image/png', kind: 'image', label: 'PNG picture', sniff: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { extension: 'gif', mimeType: 'image/gif', kind: 'image', label: 'GIF picture', sniff: (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a') },
  { extension: 'webp', mimeType: 'image/webp', kind: 'image', label: 'WebP picture', sniff: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { extension: 'avif', mimeType: 'image/avif', kind: 'image', label: 'AVIF picture', sniff: (b) => ascii(b, 4, 'ftypavif') || ascii(b, 4, 'ftypavis') },
  { extension: 'pdf', mimeType: 'application/pdf', kind: 'pdf', label: 'PDF', sniff: (b) => containsAscii(b.subarray(0, 1024), '%PDF-') },
  { extension: 'doc', mimeType: 'application/msword', kind: 'document', label: 'Word document (.doc)', sniff: isOle },
  { extension: 'docx', mimeType: `${OOXML}.wordprocessingml.document`, kind: 'document', label: 'Word document', sniff: isOoxml },
  { extension: 'xls', mimeType: 'application/vnd.ms-excel', kind: 'spreadsheet', label: 'Excel spreadsheet (.xls)', sniff: isOle },
  { extension: 'xlsx', mimeType: `${OOXML}.spreadsheetml.sheet`, kind: 'spreadsheet', label: 'Excel spreadsheet', sniff: isOoxml },
  { extension: 'ppt', mimeType: 'application/vnd.ms-powerpoint', kind: 'presentation', label: 'PowerPoint (.ppt)', sniff: isOle },
  { extension: 'pptx', mimeType: `${OOXML}.presentationml.presentation`, kind: 'presentation', label: 'PowerPoint', sniff: isOoxml },
  { extension: 'csv', mimeType: 'text/csv', kind: 'text', label: 'CSV data', sniff: isPlainText },
  { extension: 'txt', mimeType: 'text/plain', kind: 'text', label: 'Plain text', sniff: isPlainText },
  { extension: 'zip', mimeType: 'application/zip', kind: 'archive', label: 'ZIP archive', sniff: isZip },
  { extension: 'mp3', mimeType: 'audio/mpeg', kind: 'audio', label: 'MP3 audio', sniff: isMp3 },
  { extension: 'wav', mimeType: 'audio/wav', kind: 'audio', label: 'WAV audio', sniff: isWav },
  { extension: 'mp4', mimeType: 'video/mp4', kind: 'video', label: 'MP4 video', sniff: isMp4 },
  { extension: 'webm', mimeType: 'video/webm', kind: 'video', label: 'WebM video', sniff: isWebm },
  { extension: 'mov', mimeType: 'video/quicktime', kind: 'video', label: 'QuickTime video', sniff: isQuickTime },
]

const BY_EXTENSION = new Map(ACCEPTED_TYPES.map((type) => [type.extension, type]))

/** Every extension the library knows how to check, in menu order. */
export const ACCEPTABLE_EXTENSIONS: string[] = ACCEPTED_TYPES.map((type) => type.extension)

/** The allow-list used until an admin edits it: everything on the menu. */
export const DEFAULT_ALLOWED_EXTENSIONS: string[] = [...ACCEPTABLE_EXTENSIONS]

export type UploadPolicy = {
  allowedExtensions: string[]
  maxBytes: number
}

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  allowedExtensions: DEFAULT_ALLOWED_EXTENSIONS,
  maxBytes: DEFAULT_MAX_UPLOAD_MB * 1024 * 1024,
}

/**
 * Turns the raw Media Settings global into a policy. Never throws. Extensions
 * outside the menu (`html`, `svg`, `exe`, anything made up) are dropped, so the
 * setting can narrow the list but never widen it past what is safe. A blank or
 * unreadable list falls back to the default rather than refusing every upload.
 */
export function resolveUploadPolicy(settings: unknown): UploadPolicy {
  const uploads = ((settings ?? {}) as { uploads?: Record<string, unknown> }).uploads ?? {}
  const entered = typeof uploads.allowedExtensions === 'string' ? uploads.allowedExtensions : ''
  const extensions = entered
    .split(/[\s,;]+/)
    .map((item) => item.replace(/^\*?\./, '').trim().toLowerCase())
    .filter((item) => BY_EXTENSION.has(item))
  const allowedExtensions = extensions.length > 0 ? Array.from(new Set(extensions)) : DEFAULT_ALLOWED_EXTENSIONS

  const rawMb = typeof uploads.maxUploadMb === 'number' ? uploads.maxUploadMb : Number(uploads.maxUploadMb)
  const mb = Number.isFinite(rawMb) && rawMb > 0 ? Math.min(rawMb, MAX_UPLOAD_MB_CEILING) : DEFAULT_MAX_UPLOAD_MB
  return { allowedExtensions, maxBytes: Math.floor(mb * 1024 * 1024) }
}

export class UploadRefusal extends Error {
  /** HTTP status a route should answer with. */
  status: number
  constructor(message: string, status = 415) {
    super(message)
    this.name = 'UploadRefusal'
    this.status = status
  }
}

/** Extensions that make a name unsafe wherever they appear in it (`a.exe.pdf` and `a.pdf.exe` both). */
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'msi', 'scr', 'cpl', 'lnk', 'pif', 'jar', 'war', 'ear',
  'dmg', 'deb', 'rpm', 'apk', 'reg', 'hta', 'gadget',
  'js', 'jse', 'mjs', 'cjs', 'vbs', 'vbe', 'ws', 'wsc', 'wsf', 'wsh', 'ps1', 'psc1', 'psd1', 'psm1', 'psh', 'sh', 'bash', 'zsh', 'py', 'rb', 'pl', 'php', 'phtml', 'phar', 'jsp', 'asp', 'aspx', 'cgi',
  'html', 'htm', 'xhtml', 'shtml', 'xml', 'xsl', 'xslt', 'svg', 'svgz', 'swf',
])

/** Declared types that are refused whatever the extension says. */
const DENIED_DECLARED_TYPES = new Set([
  'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'image/svg+xml', 'text/javascript', 'application/javascript',
  'application/x-msdownload', 'application/x-executable', 'application/x-msdos-program', 'application/x-ms-dos-executable',
  'application/vnd.microsoft.portable-executable', 'application/x-sh', 'application/x-httpd-php', 'application/java-archive',
])

/** Lowercases a declared type and drops its parameters. */
export function normaliseDeclaredType(value: string | null | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * Cleans a file name for storage. Removes control and invisible characters
 * (including the right-to-left override used to disguise extensions), path and
 * shell-hostile characters, and trailing dots and spaces, then limits the base
 * name's length. The extension is returned separately, letters and digits only.
 */
export function cleanFileName(name: string): { base: string; extension: string } {
  const stripped = name
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[/\\?<>:*|"]/g, '')
    .trim()
  const dot = stripped.lastIndexOf('.')
  const rawBase = dot > 0 ? stripped.slice(0, dot) : dot === 0 ? '' : stripped
  const extension = dot >= 0 ? stripped.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : ''
  const base = rawBase.replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, MAX_BASE_NAME_LENGTH).replace(/[. ]+$/, '')
  return { base, extension }
}

export type InspectedUpload = {
  /** Safe name to store under (before collision handling). */
  name: string
  /** The type worked out from the bytes. Use this, never the declared one. */
  mimeType: string
  kind: FileKind
  extension: string
}

/**
 * Decides whether a file may be stored. Throws `UploadRefusal` with a message
 * fit to show the person uploading. On success returns the safe name and the
 * type found from the bytes.
 *
 * `enforceAllowList: false` skips only the admin allow-list (used when a file
 * was already accepted and then re-encoded to a different picture format); every
 * safety check still runs.
 */
export function inspectUpload(
  file: { name: string; mimetype: string; data: Uint8Array; size?: number },
  policy: UploadPolicy = DEFAULT_UPLOAD_POLICY,
  options: { enforceAllowList?: boolean } = {},
): InspectedUpload {
  const originalName = typeof file.name === 'string' ? file.name : ''
  if (originalName.includes('\0')) throw new UploadRefusal('That file name contains a hidden character and was refused.', 400)

  const declared = normaliseDeclaredType(file.mimetype)
  if (DENIED_DECLARED_TYPES.has(declared)) {
    throw new UploadRefusal(`This kind of file (${declared}) is not allowed. HTML, SVG, XML, scripts and programs cannot be uploaded.`)
  }

  const size = file.data.byteLength
  if (size === 0) throw new UploadRefusal('That file is empty.', 400)
  if (size > policy.maxBytes) {
    const limitMb = Math.round((policy.maxBytes / (1024 * 1024)) * 10) / 10
    throw new UploadRefusal(`Files must be ${limitMb} MB or smaller.`, 413)
  }

  const { base, extension } = cleanFileName(originalName)
  // Every dot-separated part counts: `report.pdf.exe` and `report.exe.pdf` are equally unsafe.
  const parts = originalName.toLowerCase().split('.')
  const dangerous = parts.slice(1).some((part) => DANGEROUS_EXTENSIONS.has(part.replace(/[^a-z0-9]/g, '')))
  if (dangerous) throw new UploadRefusal('This file name contains an extension that is not allowed (for example .exe, .html, .svg or .js).')

  const enforce = options.enforceAllowList !== false
  const allowed = new Set(policy.allowedExtensions)

  let match: AcceptedType | undefined
  let finalExtension = extension
  if (extension) {
    const byName = BY_EXTENSION.get(extension)
    if (!byName || (enforce && !allowed.has(extension))) {
      throw new UploadRefusal(`.${extension} files are not allowed. Ask an administrator to add the type in Media settings if it is needed.`)
    }
    if (byName.kind === 'image') {
      // A picture whose name and contents disagree (a PNG saved as .jpg) is still a picture:
      // store it as what it really is.
      match = ACCEPTED_TYPES.find((type) => type.kind === 'image' && type.sniff(file.data) && (!enforce || allowed.has(type.extension)))
      if (!match) throw new UploadRefusal(`This file is named .${extension} but its contents are not a supported picture.`)
    } else if (byName.sniff(file.data)) {
      match = byName
    } else {
      throw new UploadRefusal(`This file is named .${extension} but its contents are not a real ${byName.label}.`)
    }
  } else {
    // No extension (a pasted screenshot, for instance): identify by contents alone.
    match = ACCEPTED_TYPES.find((type) => (!enforce || allowed.has(type.extension)) && type.kind !== 'text' && type.sniff(file.data))
    if (!match) throw new UploadRefusal('This file has no extension and could not be recognised. Rename it with the right extension (for example .pdf).')
    finalExtension = match.extension
  }

  if (!base) throw new UploadRefusal('This file needs a name that uses letters or numbers.', 400)
  return { name: `${base}.${finalExtension}`, mimeType: match.mimeType, kind: match.kind, extension: finalExtension }
}

/** Which family a stored type belongs to, for icons and for deciding what is shown inline. Works on any declared or stored type. */
export function fileKindOf(mimeType: string | null | undefined): FileKind {
  const type = normaliseDeclaredType(mimeType)
  if (!type) return 'other'
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/zip' || type === 'application/x-zip-compressed') return 'archive'
  if (type.startsWith('text/')) return 'text'
  if (type.includes('word')) return 'document'
  if (type.includes('excel') || type.includes('spreadsheet')) return 'spreadsheet'
  if (type.includes('powerpoint') || type.includes('presentation')) return 'presentation'
  return 'other'
}

/** Short label for a file kind, used under the icon. */
export const FILE_KIND_LABELS: Record<FileKind, string> = {
  image: 'Picture',
  pdf: 'PDF',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Slides',
  text: 'Text',
  archive: 'ZIP',
  audio: 'Audio',
  video: 'Video',
  other: 'File',
}

/** The picture types a browser may show inline. SVG is deliberately absent. */
export const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
