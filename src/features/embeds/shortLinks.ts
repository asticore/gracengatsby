import { resolveEmbed, type EmbedProvider } from '@/lib/embedProviders'

/**
 * Server-side resolver for short embed links (vm.tiktok.com, pin.it, on.soundcloud.com).
 *
 * The `embed` element only understands full addresses, because its ID sits in the path of the full address. A short
 * link only redirects to one, so it is resolved here, once, when a page is saved. The stored value is the canonical
 * address, and the synchronous EmbedElement render stays as it is.
 *
 * SSRF guard, in the order a request is made:
 *   - the address must be https, with no credentials and no port, on a short-link host for its provider;
 *   - hosts that are IP literals, localhost or internal names are refused, and every hop must stay on the
 *     provider's own allowlist (short link and destination hosts only);
 *   - redirects are followed by hand (`redirect: 'manual'`), at most MAX_HOPS, and each Location is checked again;
 *   - one timeout covers the whole chain; no response body is read.
 * The final address must be one the synchronous resolver can embed, otherwise nothing is stored.
 */

export const MAX_HOPS = 5
export const RESOLVE_TIMEOUT_MS = 5000

/** Short-link host to provider. Only these hosts start a resolution. */
const SHORT_HOSTS: Record<string, EmbedProvider> = {
  'vm.tiktok.com': 'tiktok',
  'vt.tiktok.com': 'tiktok',
  'pin.it': 'pinterest',
  'on.soundcloud.com': 'soundcloud',
}

/** Every host a redirect chain may touch, per provider (short links plus their destinations). */
const PROVIDER_HOSTS: Record<'tiktok' | 'pinterest' | 'soundcloud', string[]> = {
  tiktok: ['vm.tiktok.com', 'vt.tiktok.com', 'www.tiktok.com', 'tiktok.com', 'm.tiktok.com'],
  pinterest: ['pin.it', 'pinterest.com', 'www.pinterest.com', 'm.pinterest.com'],
  soundcloud: ['on.soundcloud.com', 'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'],
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308])

export type ShortLinkResult = { ok: true; url: string; changed: boolean } | { ok: false; reason: string }

export type ResolveOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxHops?: number
}

/** The provider a short link belongs to, or null when the address is not a short link. Pure. */
export function shortLinkProvider(raw: unknown): EmbedProvider | null {
  if (typeof raw !== 'string') return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  return SHORT_HOSTS[u.hostname.toLowerCase()] ?? null
}

/** True for addresses that must never be fetched: IP literals, localhost and internal-looking names. Pure. */
export function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true
  if (host.includes(':') || host.startsWith('[')) return true // IPv6 literal
  if (/^\d+(\.\d+){0,3}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true // IPv4 literal, decimal or hex
  return false
}

/** The canonical form of an address: https, host and path only, no credentials, query or fragment. Pure. */
function canonicalOf(u: URL): string {
  return `https://${u.hostname.toLowerCase()}${u.pathname}`
}

/** Checks one address against the provider's allowlist. Returns the parsed URL or a reason. */
function checkHop(raw: string, provider: EmbedProvider): URL | string {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 'The link does not lead to a valid address.'
  }
  if (u.protocol !== 'https:') return 'The link does not lead to an https address.'
  if (u.username || u.password || (u.port && u.port !== '443')) return 'The link leads to an address that is not allowed.'
  const host = u.hostname.toLowerCase()
  if (isForbiddenHost(host)) return 'The link leads to an address that is not allowed.'
  const allowed = PROVIDER_HOSTS[provider as keyof typeof PROVIDER_HOSTS] ?? []
  if (!allowed.includes(host)) return 'The link leads to a host that is not allowed for this embed.'
  return u
}

/** The canonical address when the synchronous resolver can embed it, else null. */
function embeddable(u: URL, provider: EmbedProvider): string | null {
  const canonical = canonicalOf(u)
  return resolveEmbed(provider, canonical)?.kind === 'iframe' ? canonical : null
}

/**
 * Resolves one short embed link to its canonical address. A link that is not a short link comes back unchanged
 * (`changed: false`). A failure returns a reason and never throws, so a save is never blocked by it.
 */
export async function resolveShortEmbedUrl(raw: string, options: ResolveOptions = {}): Promise<ShortLinkResult> {
  const provider = shortLinkProvider(raw)
  if (!provider) return { ok: true, url: raw, changed: false }

  const fetchImpl = options.fetchImpl ?? fetch
  const maxHops = options.maxHops ?? MAX_HOPS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? RESOLVE_TIMEOUT_MS)

  try {
    let current = checkHop(raw.trim(), provider)
    if (typeof current === 'string') return { ok: false, reason: current }

    for (let hop = 0; hop <= maxHops; hop++) {
      const done = embeddable(current, provider)
      if (done) return { ok: true, url: done, changed: done !== raw.trim() }
      if (hop === maxHops) break

      const response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
      })
      await response.body?.cancel().catch((): undefined => undefined)

      if (!REDIRECT_CODES.has(response.status)) break
      const location = response.headers.get('location')
      if (!location) return { ok: false, reason: 'The link did not redirect to a page.' }
      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        return { ok: false, reason: 'The link redirected to an invalid address.' }
      }
      const checked = checkHop(next.toString(), provider)
      if (typeof checked === 'string') return { ok: false, reason: checked }
      current = checked
    }
    return { ok: false, reason: 'The link did not lead to a page this embed can show.' }
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError'
    return { ok: false, reason: aborted ? 'The link took too long to resolve.' : 'The link could not be resolved.' }
  } finally {
    clearTimeout(timer)
  }
}

export type BlockResolveResult = { value: unknown; resolved: number; failed: string[] }

/**
 * Walks a blocks tree (sections, columns and elements nest as JSON) and resolves every `embed` element whose
 * address is a short link for its provider. Returns a copy; the input is not changed. Elements whose provider does
 * not match the link are left alone, as before.
 */
export async function resolveEmbedShortLinks(value: unknown, options: ResolveOptions = {}): Promise<BlockResolveResult> {
  const failed: string[] = []
  let resolved = 0

  async function walk(node: unknown): Promise<unknown> {
    if (Array.isArray(node)) {
      const out: unknown[] = []
      for (const item of node) out.push(await walk(item))
      return out
    }
    if (!node || typeof node !== 'object') return node

    const record = node as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record)) out[key] = await walk(child)

    if (record.elementType === 'embed' && out.props && typeof out.props === 'object') {
      const props = { ...(out.props as Record<string, unknown>) }
      const url = typeof props.url === 'string' ? props.url : ''
      const hostProvider = shortLinkProvider(url)
      if (hostProvider && props.provider === hostProvider) {
        const result = await resolveShortEmbedUrl(url, options)
        if (result.ok === false) {
          failed.push(result.reason)
        } else if (result.changed) {
          props.url = result.url
          resolved += 1
        }
        out.props = props
      }
    }
    return out
  }

  return { value: await walk(value), resolved, failed }
}
