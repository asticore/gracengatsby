import { describe, expect, it, vi } from 'vitest'

// React's cache() only memoises inside a server request; stand in a per-process memoiser for the test.
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>()
  return { ...actual, cache: <T extends () => unknown>(fn: T) => { let v: ReturnType<T>; let done = false; return () => (done ? v : ((done = true), (v = fn() as ReturnType<T>))) } }
})

import { getBlockContext, setBlockContext } from '@/lib/blockContext'

describe('blockContext', () => {
  it('starts empty and returns what was set', () => {
    expect(getBlockContext()).toEqual({})
    setBlockContext({ page: { title: 'About' } })
    expect(getBlockContext().page).toEqual({ title: 'About' })
    setBlockContext({ product: { title: 'Vase', price: 12.5 } })
    expect(getBlockContext().product).toEqual({ title: 'Vase', price: 12.5 })
    expect(getBlockContext().page).toBeUndefined()
  })
})
