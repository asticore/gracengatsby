/**
 * Royalty-free stock photos: search four libraries, normalise their results to
 * one shape, and import a chosen picture into the media library with its credit.
 *
 * Trust boundaries, in order:
 *   - Search results come from the provider's own API, server side.
 *   - Import never trusts a URL sent by the browser on its own. Each provider's
 *     download address is re-derived or checked against an explicit allow-list of
 *     image hosts, over https, and never a private, local or IP-literal address.
 *     Openverse picks the image's address from its own API again at import time,
 *     and that address must be on the Openverse host list below.
 *   - The download is capped in size and must be a raster image type. SVG is
 *     refused, since an SVG file served from this origin can run scripts.
 */

export const STOCK_PROVIDERS = ['openverse', 'unsplash', 'pexels', 'pixabay'] as const
export type StockProvider = (typeof STOCK_PROVIDERS)[number]

export const KEYED_PROVIDERS = ['unsplash', 'pexels', 'pixabay'] as const
export type KeyedProvider = (typeof KEYED_PROVIDERS)[number]

export type StockPhoto = {
  id: string
  provider: StockProvider
  title: string
  thumb: string
  full: string
  width: number | null
  height: number | null
  author: string
  authorUrl: string
  license: string
  licenseUrl: string
  sourceUrl: string
  /** Unsplash only: the endpoint its guidelines require hitting before a download. */
  downloadLocation?: string
}

export type StockKeys = Partial<Record<KeyedProvider, string | null | undefined>>

export class StockError extends Error {
  readonly status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'StockError'
    this.status = status
  }
}

export const PER_PAGE = 20
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024
export const IMPORT_TIMEOUT_MS = 20_000

const KEY_LABELS: Record<KeyedProvider, string> = {
  unsplash: 'Unsplash access key',
  pexels: 'Pexels API key',
  pixabay: 'Pixabay API key',
}

const LICENSE_INFO: Record<StockProvider, { license: string; licenseUrl: string }> = {
  openverse: { license: 'Openverse (see licence)', licenseUrl: '' },
  unsplash: { license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license' },
  pexels: { license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/' },
  pixabay: { license: 'Pixabay License', licenseUrl: 'https://pixabay.com/service/license-summary/' },
}

/* -------------------------------------------------------------------------- */
/* Normalisers                                                                */
/* -------------------------------------------------------------------------- */

/** Returns the URL as an https address, or '' for anything else. */
export function safeHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return ''
    if (url.username || url.password) return ''
    return url.href
  } catch {
    return ''
  }
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')

/** Openverse: `licence` is a short code such as `by` or `cc0`. */
export function normaliseOpenverse(raw: Record<string, unknown>): StockPhoto | null {
  const full = safeHttpsUrl(raw.url)
  const thumb = safeHttpsUrl(raw.thumbnail) || full
  const id = str(raw.id)
  if (!full || !id) return null
  const licenceCode = str(raw.license).toUpperCase()
  const version = str(raw.license_version)
  const license = licenceCode === 'CC0' ? 'CC0 1.0 (public domain dedication)' : `CC ${licenceCode}${version ? ` ${version}` : ''}`.trim()
  return {
    id,
    provider: 'openverse',
    title: str(raw.title),
    thumb,
    full,
    width: num(raw.width),
    height: num(raw.height),
    author: str(raw.creator),
    authorUrl: safeHttpsUrl(raw.creator_url),
    license,
    licenseUrl: safeHttpsUrl(raw.license_url),
    sourceUrl: safeHttpsUrl(raw.foreign_landing_url),
  }
}

export function normaliseUnsplash(raw: Record<string, unknown>): StockPhoto | null {
  const urls = (raw.urls ?? {}) as Record<string, unknown>
  const user = (raw.user ?? {}) as { name?: unknown; links?: { html?: unknown } }
  const links = (raw.links ?? {}) as { html?: unknown; download_location?: unknown }
  const full = safeHttpsUrl(urls.full) || safeHttpsUrl(urls.regular)
  const thumb = safeHttpsUrl(urls.small) || safeHttpsUrl(urls.thumb) || full
  const id = str(raw.id)
  if (!full || !id) return null
  return {
    id,
    provider: 'unsplash',
    title: str(raw.alt_description) || str(raw.description),
    thumb,
    full,
    width: num(raw.width),
    height: num(raw.height),
    author: str(user.name),
    authorUrl: safeHttpsUrl(user.links?.html),
    ...LICENSE_INFO.unsplash,
    sourceUrl: safeHttpsUrl(links.html),
    downloadLocation: safeHttpsUrl(links.download_location),
  }
}

export function normalisePexels(raw: Record<string, unknown>): StockPhoto | null {
  const src = (raw.src ?? {}) as Record<string, unknown>
  const full = safeHttpsUrl(src.original) || safeHttpsUrl(src.large2x) || safeHttpsUrl(src.large)
  const thumb = safeHttpsUrl(src.medium) || safeHttpsUrl(src.small) || full
  const id = str(raw.id)
  if (!full || !id) return null
  return {
    id,
    provider: 'pexels',
    title: str(raw.alt),
    thumb,
    full,
    width: num(raw.width),
    height: num(raw.height),
    author: str(raw.photographer),
    authorUrl: safeHttpsUrl(raw.photographer_url),
    ...LICENSE_INFO.pexels,
    sourceUrl: safeHttpsUrl(raw.url),
  }
}

export function normalisePixabay(raw: Record<string, unknown>): StockPhoto | null {
  const full = safeHttpsUrl(raw.largeImageURL) || safeHttpsUrl(raw.webformatURL)
  const thumb = safeHttpsUrl(raw.previewURL) || safeHttpsUrl(raw.webformatURL) || full
  const id = str(raw.id)
  const user = str(raw.user)
  if (!full || !id) return null
  return {
    id,
    provider: 'pixabay',
    title: str(raw.tags),
    thumb,
    full,
    width: num(raw.imageWidth),
    height: num(raw.imageHeight),
    author: user,
    authorUrl: user ? `https://pixabay.com/users/${encodeURIComponent(user)}-${encodeURIComponent(str(raw.user_id))}/` : '',
    ...LICENSE_INFO.pixabay,
    sourceUrl: safeHttpsUrl(raw.pageURL),
  }
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export type SearchResponse = { provider: StockProvider; page: number; total: number; results: StockPhoto[] }

/** Builds the search request for one provider. Throws StockError when a required key is missing. */
export function buildSearchRequest(
  provider: StockProvider,
  query: string,
  page: number,
  keys: StockKeys,
): { url: string; headers: Record<string, string> } {
  const q = encodeURIComponent(query)
  const requireKey = (name: KeyedProvider): string => {
    const key = keys[name]?.trim()
    if (!key) throw new StockError(`Add the ${KEY_LABELS[name]} in Media settings first.`, 400)
    return key
  }

  switch (provider) {
    case 'openverse':
      return { url: `https://api.openverse.org/v1/images/?q=${q}&page=${page}&page_size=${PER_PAGE}`, headers: { accept: 'application/json' } }
    case 'unsplash':
      return {
        url: `https://api.unsplash.com/search/photos?query=${q}&page=${page}&per_page=${PER_PAGE}`,
        headers: { accept: 'application/json', authorization: `Client-ID ${requireKey('unsplash')}` },
      }
    case 'pexels':
      return {
        url: `https://api.pexels.com/v1/search?query=${q}&page=${page}&per_page=${PER_PAGE}`,
        headers: { accept: 'application/json', authorization: requireKey('pexels') },
      }
    case 'pixabay':
      return {
        url: `https://pixabay.com/api/?key=${encodeURIComponent(requireKey('pixabay'))}&q=${q}&page=${page}&per_page=${PER_PAGE}&image_type=photo&safesearch=true`,
        headers: { accept: 'application/json' },
      }
  }
}

/** Pure: a provider's search body, in the shared shape. Unusable entries are dropped. */
export function normaliseSearchBody(provider: StockProvider, body: unknown): { total: number; results: StockPhoto[] } {
  const record = (body ?? {}) as Record<string, unknown>
  const pick = (list: unknown, normalise: (raw: Record<string, unknown>) => StockPhoto | null): StockPhoto[] =>
    Array.isArray(list)
      ? list.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const photo = normalise(item as Record<string, unknown>)
          return photo ? [photo] : []
        })
      : []

  switch (provider) {
    case 'openverse':
      return { total: num(record.result_count) ?? 0, results: pick(record.results, normaliseOpenverse) }
    case 'unsplash':
      return { total: num(record.total) ?? 0, results: pick(record.results, normaliseUnsplash) }
    case 'pexels':
      return { total: num(record.total_results) ?? 0, results: pick(record.photos, normalisePexels) }
    case 'pixabay':
      return { total: num(record.totalHits) ?? 0, results: pick(record.hits, normalisePixabay) }
  }
}

export async function searchStock(
  provider: StockProvider,
  query: string,
  page: number,
  keys: StockKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResponse> {
  const request = buildSearchRequest(provider, query, page, keys)
  let response: Response
  try {
    response = await fetchImpl(request.url, { headers: request.headers, redirect: 'error' })
  } catch {
    throw new StockError('The photo library could not be reached. Try again shortly.', 502)
  }
  if (response.status === 401 || response.status === 403) {
    throw new StockError(`${provider} rejected the key. Check it in Media settings.`, 502)
  }
  if (response.status === 429) throw new StockError(`${provider} search limit reached. Try again later.`, 429)
  if (!response.ok) throw new StockError(`${provider} search failed (${response.status}).`, 502)

  const body = await response.json().catch((): null => null)
  const { total, results } = normaliseSearchBody(provider, body)
  return { provider, page, total, results }
}

/* -------------------------------------------------------------------------- */
/* Import: host checks and download                                           */
/* -------------------------------------------------------------------------- */

/** The image hosts each keyed provider serves pictures from. Openverse is handled separately. */
export const PROVIDER_IMAGE_HOSTS: Record<KeyedProvider, string[]> = {
  unsplash: ['images.unsplash.com'],
  pexels: ['images.pexels.com'],
  pixabay: ['pixabay.com', 'cdn.pixabay.com'],
}

/**
 * The image hosts Openverse commonly returns. Anything else is refused, even over
 * https: Openverse links to creators' own sites, which cannot be vetted one by one.
 * An entry beginning `*.` matches any subdomain of the rest of the name. Hosts
 * such as i.pinimg.com are deliberately not listed.
 */
export const OPENVERSE_IMAGE_HOSTS = [
  'upload.wikimedia.org',
  'live.staticflickr.com',
  '*.staticflickr.com',
  'images.unsplash.com',
  'cdn.stocksnap.io',
  'images.rawpixel.com',
  'images-assets.nasa.gov',
  'www.nasa.gov',
  'ids.si.edu',
  'www.europeana.eu',
]

/** Hostname endings used by wildcard DNS services that resolve to whatever IP is in the name. Always refused. */
const IP_WILDCARD_SUFFIXES = ['.nip.io', '.sslip.io', '.localtest.me']

/** True for a hostname that is, or resolves to a literal of, a local or private address. Literal checks only: Workers cannot resolve DNS here. */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (!host.includes('.')) return true
  if (IP_WILDCARD_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  // An address written into the name: a numeric label (3232235777.example), a dotted or dashed IPv4 run (1.2.3.4.example, ip-1-2-3-4.host).
  if (host.split('.').some((label) => /^\d+$/.test(label))) return true
  if (/(^|[.-])(\d{1,3}[.-]){3}\d{1,3}($|[.-])/.test(host)) return true
  // Any IPv6 literal is refused: none of the allowed hosts use one.
  if (host.includes(':')) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
  }
  return false
}

/** True when `host` is `entry` exactly, or is a subdomain of it when `entry` is `*.<domain>`. */
export function hostMatches(host: string, entry: string): boolean {
  if (entry.startsWith('*.')) return host.endsWith(entry.slice(1)) && host.length > entry.length - 1
  return host === entry
}

/**
 * Checks a download address: https, no credentials, default port, not a private
 * or IP-literal host, and on the explicit list of hosts (see hostMatches).
 */
export function validateImportUrl(value: string, allowed: readonly string[]): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StockError('That picture address is not valid.', 400)
  }
  if (url.protocol !== 'https:') throw new StockError('Only https picture addresses can be imported.', 400)
  if (url.username || url.password) throw new StockError('That picture address is not allowed.', 400)
  if (url.port && url.port !== '443') throw new StockError('That picture address is not allowed.', 400)
  if (isPrivateHostname(url.hostname)) throw new StockError('That picture address is not allowed.', 400)
  const host = url.hostname.toLowerCase()
  if (!allowed.some((entry) => hostMatches(host, entry))) throw new StockError('That picture is not served from a library this site can import from.', 400)
  return url
}

const IMPORT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const EXTENSION_FOR: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308])

/**
 * Downloads one picture. Redirects are followed by hand, and every hop is checked
 * against the same allow-list, so a permitted host cannot bounce the request
 * somewhere else. Size and type are checked as the bytes arrive.
 */
export async function fetchImportBytes(
  start: URL,
  allowed: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: Uint8Array; mimeType: string }> {
  let url = start
  let response: Response | null = null
  for (let hop = 0; hop < 3; hop += 1) {
    try {
      response = await fetchImpl(url.href, {
        headers: { accept: 'image/jpeg,image/png,image/webp,image/gif' },
        redirect: 'manual',
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      })
    } catch {
      throw new StockError('The picture could not be downloaded. Try again shortly.', 502)
    }
    if (!REDIRECT_CODES.has(response.status)) break
    const location = response.headers.get('location')
    if (!location) throw new StockError('The picture could not be downloaded.', 502)
    let next: string
    try {
      next = new URL(location, url).href
    } catch {
      throw new StockError('The picture moved to an address that is not valid.', 502)
    }
    url = validateImportUrl(next, allowed)
    response = null
  }
  if (!response) throw new StockError('The picture moved too many times to be downloaded.', 502)
  if (!response.ok) throw new StockError(`The picture could not be downloaded (${response.status}).`, 502)

  const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!IMPORT_MIME_TYPES.has(mimeType)) throw new StockError('That file is not a JPEG, PNG, WebP or GIF picture.', 415)

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_IMPORT_BYTES) throw new StockError('That picture is larger than 15 MB.', 413)

  const data = await readCapped(response, MAX_IMPORT_BYTES)
  return { data, mimeType }
}

/** Reads a response body, refusing as soon as it exceeds the cap. */
async function readCapped(response: Response, cap: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      await reader.cancel()
      throw new StockError('That picture is larger than 15 MB.', 413)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export type ImportRequest = {
  provider: StockProvider
  id: string
  /** The address the browser showed. Only used for the providers that send it through unchanged. */
  full?: string
  downloadLocation?: string
}

/**
 * Works out the one address a picture may be downloaded from, and checks it.
 * For Unsplash, the download_location endpoint is called first - its guidelines
 * require that call for every download, and it is also how the download is
 * tracked - and the address it returns is the one checked.
 */
export async function resolveImportUrl(
  request: ImportRequest,
  keys: StockKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<URL> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(request.id)) throw new StockError('That picture id is not valid.', 400)

  switch (request.provider) {
    case 'openverse': {
      const response = await fetchImpl(`https://api.openverse.org/v1/images/${encodeURIComponent(request.id)}/`, {
        headers: { accept: 'application/json' },
        redirect: 'error',
      }).catch((): null => null)
      const body = response?.ok ? ((await response.json().catch((): null => null)) as { url?: unknown } | null) : null
      const url = safeHttpsUrl(body?.url)
      if (!url) throw new StockError('That picture could not be found in Openverse.', 404)
      return validateImportUrl(url, OPENVERSE_IMAGE_HOSTS)
    }
    case 'unsplash': {
      const key = keys.unsplash?.trim()
      if (!key) throw new StockError('Add the Unsplash access key in Media settings first.', 400)
      const location = request.downloadLocation ? validateImportUrl(request.downloadLocation, ['api.unsplash.com']) : null
      if (!location) throw new StockError('Unsplash needs its download address before a picture can be imported.', 400)
      const response = await fetchImpl(location.href, {
        headers: { accept: 'application/json', authorization: `Client-ID ${key}` },
        redirect: 'error',
      }).catch((): null => null)
      const body = response?.ok ? ((await response.json().catch((): null => null)) as { url?: unknown } | null) : null
      return validateImportUrl(safeHttpsUrl(body?.url), PROVIDER_IMAGE_HOSTS.unsplash)
    }
    case 'pexels':
      return validateImportUrl(request.full ?? '', PROVIDER_IMAGE_HOSTS.pexels)
    case 'pixabay':
      return validateImportUrl(request.full ?? '', PROVIDER_IMAGE_HOSTS.pixabay)
  }
}

/** The allow-list that applies to the bytes download step, per provider. */
export function importAllowList(provider: StockProvider): readonly string[] {
  if (provider === 'openverse') return OPENVERSE_IMAGE_HOSTS
  return PROVIDER_IMAGE_HOSTS[provider]
}

/** A stored file name for an imported picture, such as `unsplash-abc123.jpg`. */
export function importFileName(provider: StockProvider, id: string, mimeType: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'photo'
  return `${provider}-${safeId}.${EXTENSION_FOR[mimeType] ?? 'jpg'}`
}

/** Alt text for an imported picture: its title if it has one, otherwise who took it. */
export function importAltText(photo: { title?: string; author?: string }): string {
  const title = (photo.title ?? '').replace(/\s+/g, ' ').trim()
  const text = title || (photo.author ? `Photo by ${photo.author}` : 'Stock photo')
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text
}
