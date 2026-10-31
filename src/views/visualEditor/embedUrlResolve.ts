import { shortLinkProvider } from '@/features/embeds/shortLinks'

/**
 * Editor side of the short-link resolver. When an embed address that is a short link for the element's own provider
 * is pasted or entered, the editor asks the server for the canonical address and uses it in place of the short link.
 * The server does the real checks; this only decides whether a request is worth making.
 */

/** True when the address is a short link for the given provider, so the server should resolve it. */
export function isShortLinkForProvider(url: unknown, provider: unknown): boolean {
  if (typeof url !== 'string' || typeof provider !== 'string') return false
  return shortLinkProvider(url) === provider
}

/**
 * Asks the server for the canonical address. Returns it only when the server resolved a different address; any failure
 * (network, refusal, unknown link) returns null, so the editor keeps the link as typed. Never throws.
 */
export async function resolveEmbedUrlForEditor(raw: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl('/api/admin-embed-resolve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: raw.trim() }),
    })
    if (!response.ok) return null
    const body = (await response.json().catch((): null => null)) as { ok?: unknown; url?: unknown; changed?: unknown } | null
    if (!body || body.ok !== true || body.changed !== true || typeof body.url !== 'string') return null
    return body.url
  } catch {
    return null
  }
}
