// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  docs: [] as Array<Record<string, unknown>>,
  audience: 'guests' as 'members' | 'guests',
  pageIdByPath: {} as Record<string, string>,
  audienceReads: 0,
  pageReads: 0,
  resets: [] as Array<() => void>,
}))

// React's cache() only memoises inside a server render; here it memoises until the next test starts.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>()
    state.resets.push(() => memo.clear())
    return (...args: A): R => {
      const key = JSON.stringify(args)
      if (!memo.has(key)) memo.set(key, fn(...args))
      return memo.get(key) as R
    }
  }
  return { ...actual, default: { ...actual, cache }, cache }
})

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    find: async () => ({ docs: state.docs.filter((d) => d.enabled !== false) }),
    findByID: async ({ id }: { id: number | string }) => state.docs.find((d) => String(d.id) === String(id)) ?? null,
  }),
}))

vi.mock('@/features/siteTemplates/audience', () => ({
  currentAudience: async () => {
    state.audienceReads += 1
    return state.audience
  },
  pageIdForPath: async (path: string) => {
    state.pageReads += 1
    return state.pageIdByPath[path] ?? null
  },
  normalisePagePath: (path: string) => path,
}))

const tpl = (id: number, extra: Record<string, unknown> = {}) => ({ id, name: `t${id}`, kind: 'header', enabled: true, priority: 10, conditions: [] as unknown[], blocks: [{ blockType: 'text', text: `T${id}` }], ...extra })
const rule = (param: string, value: string, operator = 'equals') => ({ param, operator, value })

// The first import pulls in the element renderers, which is slow on a cold cache: done once, with its own timeout.
const COLD_IMPORT_TIMEOUT_MS = 120_000
beforeAll(async () => {
  await import('@/features/siteTemplates/resolve')
}, COLD_IMPORT_TIMEOUT_MS)

beforeEach(() => {
  state.resets.forEach((reset) => reset())
  state.docs = []
  state.audience = 'guests'
  state.pageIdByPath = {}
  state.audienceReads = 0
  state.pageReads = 0
})

describe('resolveSiteTemplate with audience and page conditions', () => {
  it('shows a members header to a signed-in visitor and the general header to a guest', async () => {
    state.docs = [tpl(1), tpl(2, { conditions: [[rule('audience', 'members')]] })]
    const { resolveSiteTemplate } = await import('@/features/siteTemplates/resolve')
    state.audience = 'members'
    expect((await resolveSiteTemplate('header', { path: '/' }))?.id).toBe(2)
    state.audience = 'guests'
    expect((await resolveSiteTemplate('header', { path: '/' }))?.id).toBe(1)
  })

  it('an explicit audience in the context is used as given and the session is not read', async () => {
    state.docs = [tpl(2, { conditions: [[rule('audience', 'members')]] })]
    const { resolveSiteTemplate } = await import('@/features/siteTemplates/resolve')
    state.audience = 'guests'
    expect((await resolveSiteTemplate('header', { path: '/', audience: 'members' }))?.id).toBe(2)
    expect(state.audienceReads).toBe(0)
  })

  it('reads the session only when a template of that kind uses an audience', async () => {
    state.docs = [tpl(1), tpl(2, { kind: 'footer', conditions: [[rule('audience', 'members')]] })]
    const { resolveSiteTemplate } = await import('@/features/siteTemplates/resolve')
    await resolveSiteTemplate('header', { path: '/' })
    expect(state.audienceReads).toBe(0)
    await resolveSiteTemplate('footer', { path: '/' })
    expect(state.audienceReads).toBe(1)
  })

  it('a header limited to one page shows there only, from the page the path answers at', async () => {
    state.docs = [tpl(1), tpl(2, { conditions: [[rule('page', '7,9')]] })]
    state.pageIdByPath = { '/about': '9', '/shop': '3' }
    const { resolveSiteTemplate } = await import('@/features/siteTemplates/resolve')
    expect((await resolveSiteTemplate('header', { path: '/about' }))?.id).toBe(2)
    expect((await resolveSiteTemplate('header', { path: '/shop' }))?.id).toBe(1)
  })

  it('a page header and a members header combine: the member on that page gets the page header first', async () => {
    state.docs = [tpl(1), tpl(2, { conditions: [[rule('audience', 'members')]] }), tpl(3, { conditions: [[rule('audience', 'members'), rule('page', '7')]] })]
    state.pageIdByPath = { '/about': '7' }
    state.audience = 'members'
    const { resolveSiteTemplate } = await import('@/features/siteTemplates/resolve')
    expect((await resolveSiteTemplate('header', { path: '/about' }))?.id).toBe(3)
    expect((await resolveSiteTemplate('header', { path: '/shop' }))?.id).toBe(2)
  })
})
