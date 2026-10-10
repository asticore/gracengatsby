/**
 * Pure builders for the "Site files" group of SEO & Analytics: llms.txt,
 * security.txt, ads.txt, app-ads.txt, humans.txt, the web app manifest, and
 * the server response-header and blocked-path rules.
 *
 * Nothing in this file imports the engine, the database or Next. The request
 * middleware and the client-side admin field both use it, so it has to stay
 * importable from an edge bundle and from a browser. Data gathering lives in
 * ./siteFilesData.ts.
 */

export const TEXT_FILE_MAX_BYTES = 100_000
export const LLMS_FULL_MAX_BYTES = 1_000_000

export type SiteFilesSettings = {
  llmsEnabled?: boolean | null
  llmsTitle?: string | null
  llmsSummary?: string | null
  llmsIncludeCollections?: string[] | null
  llmsExcludePaths?: string | null
  securityTxtContact?: string | null
  securityTxtExpires?: string | null
  securityTxtPolicy?: string | null
  securityTxtLanguages?: string | null
  securityTxtCustom?: string | null
  adsTxt?: string | null
  appAdsTxt?: string | null
  humansTxt?: string | null
  manifestName?: string | null
  manifestShortName?: string | null
  manifestThemeColor?: string | null
  manifestBackgroundColor?: string | null
  manifestDisplay?: string | null
  serverResponseHeaders?: string | null
  serverBlockedPaths?: string | null
  overview?: string | null
}

export type SiteFileState = 'served' | 'off' | 'empty'

// --- Text cleaning ----------------------------------------------------------

/** Control characters other than tab, newline and carriage return. */
const isControl = (code: number): boolean => (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127

/** Strips control characters and normalises line endings. Non-strings become ''. */
export const cleanText = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const stripped = Array.from(value)
    .filter((ch) => !isControl(ch.charCodeAt(0)))
    .join('')
  return stripped.replace(/\r\n?/g, '\n').trim()
}

/** Collapses everything, line breaks included, into single spaces. */
export const oneLine = (value: unknown): string => cleanText(value).replace(/\s+/g, ' ').trim()

const truncate = (value: string, max: number): string => {
  if (value.length <= max) return value
  const cut = value.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

const byteLength = (value: string): number => new TextEncoder().encode(value).length

// --- HTML to text -----------------------------------------------------------

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
}

const decodeEntities = (value: string): string =>
  value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
      const key = name.toLowerCase()
      if (key in ENTITY_MAP) return ENTITY_MAP[key]
      const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : key.startsWith('#') ? parseInt(key.slice(1), 10) : NaN
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code)
      return match
    })
    // Last, so "&amp;lt;" becomes "&lt;" as text rather than "<".
    .replace(/&amp;/gi, '&')

/**
 * Turns an HTML fragment into plain text for a text/plain file.
 *
 * This is not a sanitiser and does not need to be one: the output is served as
 * text/plain and never rendered. The aim is only that no tag or script body
 * survives into the file. Blocks that carry no readable text are removed whole,
 * an unterminated tag at the end is dropped, and entities are decoded once.
 */
export const htmlToText = (input: string): string => {
  const text = input
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/<(script|style|noscript|template|iframe|svg)\b[\s\S]*?(<\/\1\s*>|$)/gi, ' ')
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|section|article|blockquote|figure)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>?/g, ' ')
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join('\n')
    .trim()
}

const TEXT_KEYS = new Set([
  'text',
  'content',
  'body',
  'heading',
  'subheading',
  'title',
  'description',
  'excerpt',
  'caption',
  'quote',
  'label',
  'html',
])

/**
 * Collects the readable text from a rich-text value or a block tree.
 *
 * Accepts either an HTML string or a JSON node tree (the editor's own format).
 * Only strings sitting under known text-bearing keys are kept, so URLs, ids and
 * type names never leak into a summary.
 */
export const richTextToText = (value: unknown, maxChars = 4000): string => {
  const pieces: string[] = []
  const walk = (node: unknown, depth: number): void => {
    if (depth > 16 || pieces.length > 4000) return
    if (typeof node === 'string') {
      pieces.push(htmlToText(node))
      return
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, depth + 1))
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (typeof child === 'string') {
          if (TEXT_KEYS.has(key)) pieces.push(htmlToText(child))
        } else if (child && typeof child === 'object') {
          walk(child, depth + 1)
        }
      }
    }
  }
  walk(value, 0)
  const joined = pieces.filter(Boolean).join('\n\n')
  return truncate(joined.replace(/\n{3,}/g, '\n\n'), maxChars)
}

// --- llms.txt ---------------------------------------------------------------

export type LlmsItem = { title: string; url: string; description?: string; body?: string }
export type LlmsSection = { heading: string; items: LlmsItem[] }
export type LlmsInput = { title: string; summary?: string | null; sections: LlmsSection[] }

const linkText = (value: string): string => oneLine(value).replace(/[[\]]/g, '')

const llmsHeader = (input: LlmsInput): string[] => {
  const title = oneLine(input.title) || 'Site'
  const lines = [`# ${title}`, '']
  const summary = oneLine(input.summary)
  if (summary) lines.push(`> ${summary}`, '')
  return lines
}

/**
 * llms.txt in the llmstxt.org layout: an H1, a blockquote summary, then an H2
 * per section with one `- [Title](url): description` line per item.
 */
export const buildLlmsTxt = (input: LlmsInput): string => {
  const lines = llmsHeader(input)
  for (const section of input.sections) {
    if (section.items.length === 0) continue
    lines.push(`## ${oneLine(section.heading)}`, '')
    for (const item of section.items) {
      const description = oneLine(item.description)
      const suffix = description ? `: ${truncate(description, 200)}` : ''
      lines.push(`- [${linkText(item.title)}](${item.url})${suffix}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * llms-full.txt: the same index followed by each item's plain-text body.
 *
 * Items are appended whole until the next one would take the file past
 * `maxBytes`, and the file then says where it stopped. A half-written item is
 * never emitted.
 */
export const buildLlmsFullTxt = (input: LlmsInput, maxBytes = LLMS_FULL_MAX_BYTES): string => {
  const out: string[] = llmsHeader(input)
  let size = byteLength(out.join('\n'))
  const marker = '\n(This file was cut short to stay within its size limit.)\n'
  const budget = maxBytes - byteLength(marker)

  for (const section of input.sections) {
    if (section.items.length === 0) continue
    const heading = `## ${oneLine(section.heading)}\n`
    const pieces: string[] = []
    for (const item of section.items) {
      const body = cleanText(item.body)
      const piece = [`### ${linkText(item.title)}`, `URL: ${item.url}`, '', body, ''].join('\n')
      if (size + byteLength(heading) + byteLength(piece) > budget) {
        const partial = `${out.join('\n')}\n${pieces.length ? heading : ''}${pieces.join('\n')}${marker}`
        return partial.trimEnd() + '\n'
      }
      pieces.push(piece)
      // +1 for the newline the join below adds after this piece.
      size += byteLength(piece) + 1
    }
    out.push(heading, pieces.join('\n'))
    size += byteLength(heading)
  }
  return `${out.join('\n').trimEnd()}\n`
}

// --- security.txt (RFC 9116) ------------------------------------------------

export type ExpiryState = 'valid' | 'expired' | 'invalid' | 'missing'

/**
 * Reads the Expires value. Accepts a calendar date or a full ISO 8601 time.
 * A date that is not strictly in the future counts as expired, and the file is
 * not served, because a stale security.txt tells researchers the contact may
 * no longer be watched.
 */
export const evaluateExpires = (value: unknown, now: Date): { state: ExpiryState; iso?: string } => {
  const text = oneLine(value)
  if (!text) return { state: 'missing' }
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return { state: 'invalid' }
  }
  const parsed = new Date(text.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return { state: 'invalid' }
  if (parsed.getTime() <= now.getTime()) return { state: 'expired' }
  return { state: 'valid', iso: parsed.toISOString() }
}

/** An email address (given a mailto: prefix if missing), or a tel:/https: URI. */
export const normaliseContact = (value: unknown): string | null => {
  const text = oneLine(value)
  if (!text || /\s/.test(text)) return null
  if (/^mailto:/i.test(text) || /^tel:/i.test(text) || /^https:\/\//i.test(text)) return text
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return `mailto:${text}`
  return null
}

const normaliseHttpsUrl = (value: unknown): string | null => {
  const text = oneLine(value)
  if (!text || /\s/.test(text)) return null
  return /^https:\/\/[^\s]+$/i.test(text) ? text : null
}

const normaliseLanguages = (value: unknown): string | null => {
  const tags = oneLine(value)
    .split(/[,\s]+/)
    .filter(Boolean)
  if (tags.length === 0) return null
  const valid = tags.every((tag) => /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(tag))
  return valid ? tags.join(', ') : null
}

/** Whether security.txt can be served, and why not when it cannot. */
export const securityTxtState = (
  settings: SiteFilesSettings,
  now: Date,
): { state: SiteFileState; reason: string } => {
  if (cleanText(settings.securityTxtCustom)) return { state: 'served', reason: 'Served exactly as typed.' }
  const contact = oneLine(settings.securityTxtContact)
  const expiry = evaluateExpires(settings.securityTxtExpires, now)
  if (!contact && expiry.state === 'missing') {
    return { state: 'empty', reason: 'Add a contact and an expiry date to publish it.' }
  }
  if (!contact || !normaliseContact(contact)) {
    return { state: 'off', reason: 'The contact must be an email address, a tel: link or an https:// link.' }
  }
  if (expiry.state === 'missing') return { state: 'off', reason: 'An expiry date is required.' }
  if (expiry.state === 'invalid') return { state: 'off', reason: 'The expiry date must look like 2027-12-31.' }
  if (expiry.state === 'expired') return { state: 'off', reason: 'The expiry date has passed. Set a later one.' }
  return { state: 'served', reason: `Valid until ${expiry.iso?.slice(0, 10)}.` }
}

/**
 * security.txt body, or null when the file must not be served.
 *
 * A custom body is returned verbatim. Otherwise the RFC 9116 fields are built:
 * Contact and Expires are required, and an optional Policy, Preferred-Languages
 * and Canonical are added when they are valid. Optional values that do not
 * validate are left out rather than failing the whole file.
 */
export const buildSecurityTxt = (settings: SiteFilesSettings, baseUrl: string, now: Date): string | null => {
  const custom = cleanText(settings.securityTxtCustom)
  if (custom) return byteLength(custom) > TEXT_FILE_MAX_BYTES ? null : `${custom}\n`

  const { state } = securityTxtState(settings, now)
  if (state !== 'served') return null

  const contact = normaliseContact(settings.securityTxtContact)
  const expiry = evaluateExpires(settings.securityTxtExpires, now)
  if (!contact || expiry.state !== 'valid' || !expiry.iso) return null

  const lines = [
    `Contact: ${contact}`,
    `Expires: ${expiry.iso}`,
  ]
  const policy = normaliseHttpsUrl(settings.securityTxtPolicy)
  if (policy) lines.push(`Policy: ${policy}`)
  const languages = normaliseLanguages(settings.securityTxtLanguages)
  if (languages) lines.push(`Preferred-Languages: ${languages}`)
  lines.push(`Canonical: ${baseUrl.replace(/\/+$/, '')}/.well-known/security.txt`)

  return `${lines.join('\n')}\n`
}

// --- ads.txt, app-ads.txt, humans.txt ---------------------------------------

/**
 * A plain text file taken verbatim. Returns null when blank, or when it is over
 * 100 KB: a truncated ads.txt authorises the wrong sellers, so it is withheld
 * rather than cut.
 */
export const buildPlainTextFile = (value: unknown): string | null => {
  const text = cleanText(value)
  if (!text) return null
  if (byteLength(text) > TEXT_FILE_MAX_BYTES) return null
  return `${text}\n`
}

export const plainTextState = (value: unknown): { state: SiteFileState; reason: string } => {
  const text = cleanText(value)
  if (!text) return { state: 'empty', reason: 'Nothing entered yet.' }
  if (byteLength(text) > TEXT_FILE_MAX_BYTES) {
    return { state: 'off', reason: 'Over 100 KB, so it is withheld. Shorten it to serve it.' }
  }
  return { state: 'served', reason: 'Served exactly as typed.' }
}

// --- Web app manifest -------------------------------------------------------

export const DISPLAY_MODES = ['standalone', 'minimal-ui', 'browser'] as const
export type ManifestDisplay = (typeof DISPLAY_MODES)[number]

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export type ManifestInput = {
  siteName?: string | null
  settings: SiteFilesSettings
  iconUrls?: { favicon?: string | null; logo?: string | null }
}

export type WebManifest = {
  name: string
  short_name: string
  start_url: string
  display: ManifestDisplay
  theme_color?: string
  background_color?: string
  icons?: { src: string; sizes: string; purpose?: string }[]
}

/**
 * The web app manifest object. `name` falls back to the site name and
 * `short_name` to the first twelve characters of the name. Colours that are not
 * hex values are dropped rather than written as invalid JSON strings. Returns
 * null when there is no name to show at all.
 */
export const buildManifest = ({ siteName, settings, iconUrls = {} }: ManifestInput): WebManifest | null => {
  const name = oneLine(settings.manifestName) || oneLine(siteName)
  if (!name) return null

  const shortName = oneLine(settings.manifestShortName) || Array.from(name).slice(0, 12).join('')
  const display = (DISPLAY_MODES as readonly string[]).includes(settings.manifestDisplay ?? '')
    ? (settings.manifestDisplay as ManifestDisplay)
    : 'standalone'

  const manifest: WebManifest = { name, short_name: shortName, start_url: '/', display }

  const theme = oneLine(settings.manifestThemeColor)
  if (HEX_COLOUR.test(theme)) manifest.theme_color = theme
  const background = oneLine(settings.manifestBackgroundColor)
  if (HEX_COLOUR.test(background)) manifest.background_color = background

  const icons: NonNullable<WebManifest['icons']> = []
  if (iconUrls.favicon) icons.push({ src: iconUrls.favicon, sizes: 'any' })
  if (iconUrls.logo) icons.push({ src: iconUrls.logo, sizes: 'any', purpose: 'any' })
  if (icons.length) manifest.icons = icons

  return manifest
}

// --- Server response headers and blocked paths ------------------------------

/**
 * Headers an editor may not set from the settings screen. Each one either
 * belongs to the transport (length, encoding, connection), would break the page
 * it is attached to (content type, redirects), or would let one visitor's
 * response be sent to another (cookies, host).
 */
export const FORBIDDEN_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'content-length',
  'content-encoding',
  'content-type',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'host',
  'location',
  'refresh',
  'proxy-authorization',
  'proxy-authenticate',
])

export const MAX_RESPONSE_HEADERS = 50
const MAX_HEADER_VALUE = 2000

export type ParsedHeaders = {
  headers: [string, string][]
  rejected: { line: string; reason: string }[]
}

/**
 * Parses "Name: value" lines into header pairs.
 *
 * A line is rejected, and the others kept, when its name has characters outside
 * letters, digits and hyphens, when the name is on the forbidden list, when the
 * value is empty, or when the value would carry a line break (header injection),
 * a control character, or a character above U+00FF that a header cannot hold.
 * Blank lines and lines starting with # are ignored.
 */
export const parseResponseHeaders = (value: unknown): ParsedHeaders => {
  const headers: [string, string][] = []
  const rejected: { line: string; reason: string }[] = []
  const seen = new Set<string>()

  for (const raw of cleanText(value).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const colon = line.indexOf(':')
    if (colon <= 0) {
      rejected.push({ line, reason: 'Use the form Name: value.' })
      continue
    }
    const name = line.slice(0, colon).trim()
    const headerValue = line.slice(colon + 1).trim()

    if (!/^[A-Za-z0-9-]+$/.test(name)) {
      rejected.push({ line, reason: 'The header name may contain only letters, digits and hyphens.' })
      continue
    }
    const lower = name.toLowerCase()
    if (FORBIDDEN_RESPONSE_HEADERS.has(lower)) {
      rejected.push({ line, reason: `${name} cannot be set here.` })
      continue
    }
    if (!headerValue) {
      rejected.push({ line, reason: 'The value is empty.' })
      continue
    }
    if (/[\r\n\0]/.test(headerValue) || headerValue.length > MAX_HEADER_VALUE) {
      rejected.push({ line, reason: 'The value must be one line of up to 2000 characters.' })
      continue
    }
    // Header values travel as ISO-8859-1 bytes: anything above U+00FF cannot be
    // sent, and control characters are never valid in a value.
    if (/[^\x00-\xFF]/.test(headerValue) || /[\x00-\x1F\x7F]/.test(headerValue)) {
      rejected.push({ line, reason: 'The value may contain only Latin-1 characters and no control characters.' })
      continue
    }
    if (seen.has(lower)) {
      rejected.push({ line, reason: `${name} is already set above.` })
      continue
    }
    if (headers.length >= MAX_RESPONSE_HEADERS) {
      rejected.push({ line, reason: `At most ${MAX_RESPONSE_HEADERS} headers.` })
      continue
    }
    seen.add(lower)
    headers.push([name, headerValue])
  }

  return { headers, rejected }
}

/** Paths that can never be blocked, whatever the settings say. */
export const PROTECTED_PATH_PREFIXES = ['/admin', '/api', '/_next', '/preview']

export type ParsedBlockedPaths = {
  paths: string[]
  rejected: { line: string; reason: string }[]
}

/**
 * Parses one path per line into normalised prefixes.
 *
 * A trailing `*` is accepted and dropped, since the blocking is a prefix match
 * either way. The root path is refused outright, because blocking it would take
 * the whole site down, and so are the admin, API and preview areas.
 */
export const parseBlockedPaths = (value: unknown): ParsedBlockedPaths => {
  const paths: string[] = []
  const rejected: { line: string; reason: string }[] = []
  const seen = new Set<string>()

  for (const raw of cleanText(value).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    let path = line.replace(/\/?\*+$/, '')
    path = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`

    if (path === '/') {
      rejected.push({ line, reason: 'The whole site cannot be blocked from here.' })
      continue
    }
    if (/[\s?#]/.test(path) || path.split('/').includes('..')) {
      rejected.push({ line, reason: 'Enter a plain path such as /old-catalogue.' })
      continue
    }
    const lower = path.toLowerCase()
    if (PROTECTED_PATH_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))) {
      rejected.push({ line, reason: 'The admin, API and preview areas cannot be blocked.' })
      continue
    }
    if (seen.has(lower)) continue
    seen.add(lower)
    paths.push(path)
  }

  return { paths, rejected }
}

/**
 * Whether a request path falls under one of the blocked prefixes. Matches the
 * path itself and anything beneath it, on a segment boundary, so /shop blocks
 * /shop/tea but not /shopping.
 */
export const isBlockedPath = (pathname: string, blocked: readonly string[]): boolean => {
  if (blocked.length === 0) return false
  const target = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  return blocked.some((prefix) => {
    const clean = prefix.toLowerCase()
    return target === clean || target.startsWith(`${clean}/`)
  })
}

// --- Overview for the admin card --------------------------------------------

export type SiteFileRow = {
  id: string
  label: string
  path: string
  state: SiteFileState
  note: string
}

/**
 * The rows the admin "Site files" card shows, from the values currently in the
 * form (so an edit shows its effect before saving). Favicon is not in this list:
 * it is set on Site settings, which the card cannot read.
 */
export const describeSiteFiles = (settings: SiteFilesSettings, now: Date = new Date()): SiteFileRow[] => {
  const llmsOff = settings.llmsEnabled === false
  const llmsRow = (id: string, label: string, path: string): SiteFileRow => ({
    id,
    label,
    path,
    state: llmsOff ? 'off' : 'served',
    note: llmsOff ? 'Turned off above.' : 'Built from your published pages.',
  })

  const toRow = (id: string, label: string, path: string, result: { state: SiteFileState; reason: string }): SiteFileRow => ({
    id,
    label,
    path,
    state: result.state,
    note: result.reason,
  })

  return [
    llmsRow('llms', 'llms.txt', '/llms.txt'),
    llmsRow('llms-full', 'llms-full.txt', '/llms-full.txt'),
    toRow('security', 'security.txt', '/.well-known/security.txt', securityTxtState(settings, now)),
    toRow('ads', 'ads.txt', '/ads.txt', plainTextState(settings.adsTxt)),
    toRow('app-ads', 'app-ads.txt', '/app-ads.txt', plainTextState(settings.appAdsTxt)),
    toRow('humans', 'humans.txt', '/humans.txt', plainTextState(settings.humansTxt)),
    {
      id: 'manifest',
      label: 'Web app manifest',
      path: '/manifest.webmanifest',
      state: 'served',
      note: 'Uses your site name if no app name is entered.',
    },
  ]
}
