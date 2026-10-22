import { decryptSecretHook } from '@/utilities/secretField'

import { fetchPosts } from './adapters'
import { SOCIAL_PROVIDERS, type SocialAccount, type SocialPost, type SocialProvider } from './types'

/** How long a fetched feed is reused. The page itself is edge cached, so this mostly protects the provider quotas. */
export const FEED_TTL_MS = 30 * 60 * 1000
export const FETCH_COUNT = 24

type EngineLike = { findGlobal: (args: Record<string, unknown>) => Promise<unknown> }

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Reads the connected accounts, decrypting tokens. Never throws. The result must stay on the server. */
export async function readSocialAccounts(engine: EngineLike): Promise<SocialAccount[]> {
  try {
    const doc = (await engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })) as { socialAccounts?: unknown } | null
    const rows = Array.isArray(doc?.socialAccounts) ? (doc.socialAccounts as Record<string, unknown>[]) : []
    const out: SocialAccount[] = []
    for (const r of rows) {
      const provider = text(r.provider) as SocialProvider
      const id = text(r.id)
      if (!id || !SOCIAL_PROVIDERS.includes(provider)) continue
      const rawToken = text(r.accessToken)
      const token = rawToken.startsWith('enc:v1:') ? text(decryptSecretHook({ value: rawToken } as never)) : rawToken
      out.push({ id, provider, label: text(r.label) || provider, accountId: text(r.accountId), token })
    }
    return out
  } catch {
    return []
  }
}

/** Id and label only: the one shape the editor and public code may see. */
export const publicAccountList = (accounts: SocialAccount[]): { value: string; label: string }[] =>
  accounts.map((a) => ({ value: a.id, label: `${a.label} (${a.provider})` }))

type Entry = { at: number; posts: SocialPost[] }
const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<SocialPost[]>>()

/** Cache key. Includes the account address but never the token. */
const keyOf = (a: SocialAccount): string => `${a.id}|${a.provider}|${a.accountId}`

const cacheRequest = (key: string): Request => new Request(`https://social-feed-cache.invalid/${encodeURIComponent(key)}`)

async function edgeGet(key: string): Promise<Entry | null> {
  try {
    const hit = await (globalThis as { caches?: { default?: Cache } }).caches?.default?.match(cacheRequest(key))
    return hit ? ((await hit.json()) as Entry) : null
  } catch {
    return null
  }
}

async function edgePut(key: string, entry: Entry): Promise<void> {
  try {
    await (globalThis as { caches?: { default?: Cache } }).caches?.default?.put(
      cacheRequest(key),
      new Response(JSON.stringify(entry), { headers: { 'Cache-Control': `max-age=${FEED_TTL_MS / 1000}`, 'Content-Type': 'application/json' } }),
    )
  } catch {
    /* the cache is an optimisation */
  }
}

/** Test hook. */
export const clearFeedCache = (): void => {
  memory.clear()
  inflight.clear()
}

/**
 * Posts for an account: fresh cache first, then the provider. On a provider failure the last good copy (however old)
 * is served, and with none the result is empty. Never throws and never leaks the token.
 */
export async function getFeed(account: SocialAccount, fetchImpl?: Parameters<typeof fetchPosts>[2], now = Date.now()): Promise<SocialPost[]> {
  const key = keyOf(account)
  const mem = memory.get(key)
  if (mem && now - mem.at < FEED_TTL_MS) return mem.posts
  const edge = mem ? null : await edgeGet(key)
  if (edge && now - edge.at < FEED_TTL_MS) {
    memory.set(key, edge)
    return edge.posts
  }
  const running = inflight.get(key)
  if (running) return running
  const job = (async (): Promise<SocialPost[]> => {
    try {
      const posts = await fetchPosts(account, FETCH_COUNT, fetchImpl)
      const entry = { at: now, posts }
      memory.set(key, entry)
      await edgePut(key, entry)
      return posts
    } catch {
      const stale = (mem ?? edge)?.posts
      // Back off for two minutes so a broken account is not retried on every render.
      memory.set(key, { at: now - FEED_TTL_MS + 120_000, posts: stale ?? [] })
      return stale ?? []
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, job)
  return job
}
