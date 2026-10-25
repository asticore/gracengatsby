import { describe, expect, it, vi } from 'vitest'

import { AUTH_COOKIE } from '@/features/speed/headers'
import { requestVerdict } from '@/features/speed/edgeCache'

const store = new Map<string, Response>()
vi.mock('@/features/speed/purge', () => ({
  openEdgeCache: async (): Promise<unknown> => ({
    match: async (key: string): Promise<Response | undefined> => store.get(key)?.clone(),
    put: async (key: string, res: Response): Promise<void> => void store.set(key, res),
  }),
}))

import { withPageCache } from '@/features/speed/pageCache'

const speed = {
  enabled: true,
  caching: { pageCache: true, cacheLoggedInUsers: true, ttlSeconds: 300 },
} as never

const req = (cookie?: string) => new Request('https://site.test/blog/secret', { headers: cookie ? { cookie } : {} })
const page = (body: string) => async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })

describe('per-visitor decisions are never cached as public', () => {
  it('a signed-in visitor never reads or writes the shared copy, even with "cache logged-in users" on', async () => {
    store.clear()
    const res = await withPageCache(req(`${AUTH_COOKIE}=abc`), page('members only content'), speed)
    expect(await res.text()).toBe('members only content')
    expect(store.size).toBe(0)
    // an anonymous visitor must never be handed what a signed-in one saw
    const anon = await withPageCache(req(), page('sign-in gate'), speed)
    expect(await anon.text()).toBe('sign-in gate')
    const again = await withPageCache(req(`${AUTH_COOKIE}=abc`), page('members only content'), speed)
    expect(await again.text()).toBe('members only content')
  })

  it('a visitor holding a group unlock cookie bypasses the shared page cache and the edge cache', async () => {
    store.clear()
    await withPageCache(req('eg_unlock_group_3=token'), page('unlocked content'), speed)
    expect(store.size).toBe(0)
    const rules = { neverCachePaths: [], neverCacheQueryStrings: [], neverCacheCookies: [], cacheLoggedInUsers: true } as never
    expect(requestVerdict('https://site.test/blog/secret', 'GET', new Headers({ cookie: 'eg_unlock_group_3=token' }), rules)).toEqual({ cacheable: false, reason: 'unlock' })
    expect(requestVerdict('https://site.test/blog/secret', 'GET', new Headers({ cookie: 'engage-token=abc' }), rules)).toEqual({ cacheable: false, reason: 'signed-in' })
  })
})
