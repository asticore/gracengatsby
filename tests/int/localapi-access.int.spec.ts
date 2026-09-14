// No `@vitest-environment node` / `@/engage.config` ceremony here (compare
// e.g. tests/int/cms-db-events.int.spec.ts, which needs both to enter the
// real @/engine <-> @/engage.config circular import against a live D1 db):
// src/localapi/access.ts has zero dependency on @/engine, @/engage.config, or
// the database in this file - it's pure functions over plain values and a
// fake `req`, so the default jsdom environment this repo's vitest.config.mts
// already runs under is enough. Same reasoning as
// localapi-validators.int.spec.ts.
import { describe, expect, it, vi } from 'vitest'

import { type AccessFn, type FieldAccessFn, type LocalReq, type Where, combineQueries, executeAccess, executeFieldAccess, Forbidden } from '@/localapi/access'

const reqWithUser = (user: LocalReq['user']): LocalReq => ({ user })
const anonReq: LocalReq = { user: null }

describe('combineQueries', () => {
  it('both undefined -> {}', () => {
    expect(combineQueries(undefined, undefined)).toEqual({})
  })

  it('where only -> wraps it in and, unmodified', () => {
    const where: Where = { title: { equals: 'a' } }
    expect(combineQueries(where, undefined)).toEqual({ and: [{ title: { equals: 'a' } }] })
  })

  it('access Where only -> wraps it in and', () => {
    const access: Where = { _status: { equals: 'published' } }
    expect(combineQueries(undefined, access)).toEqual({ and: [{ _status: { equals: 'published' } }] })
  })

  it('where undefined, access `true` -> { and: [] }, NOT {} (real Payload edge case)', () => {
    expect(combineQueries(undefined, true)).toEqual({ and: [] })
  })

  it('where undefined, access `false` -> {} (both sides falsy)', () => {
    expect(combineQueries(undefined, false)).toEqual({})
  })

  it('both a plain where and a Where access result -> and: [where, access], not merged/flattened', () => {
    const where: Where = { title: { equals: 'a' } }
    const access: Where = { customer: { equals: 1 } }
    expect(combineQueries(where, access)).toEqual({ and: [{ title: { equals: 'a' } }, { customer: { equals: 1 } }] })
  })

  it('where already has its own top-level `and` - nested one level deeper, never unwrapped', () => {
    const where: Where = { and: [{ a: { equals: 1 } }, { b: { equals: 2 } }] }
    const access: Where = { c: { equals: 3 } }
    expect(combineQueries(where, access)).toEqual({
      and: [{ and: [{ a: { equals: 1 } }, { b: { equals: 2 } }] }, { c: { equals: 3 } }],
    })
  })

  it('where already has its own top-level `or` - same treatment, wrapped not merged', () => {
    const where: Where = { or: [{ a: { equals: 1 } }, { b: { equals: 2 } }] }
    expect(combineQueries(where, true)).toEqual({ and: [{ or: [{ a: { equals: 1 } }, { b: { equals: 2 } }] }] })
  })

  it('access result itself has and/or keys - still just pushed as one element of the outer and', () => {
    const access: Where = { or: [{ x: { equals: 1 } }, { y: { equals: 2 } }] }
    expect(combineQueries(undefined, access)).toEqual({ and: [{ or: [{ x: { equals: 1 } }, { y: { equals: 2 } }] }] })
  })
})

describe('executeAccess', () => {
  it('access fn returns `true` -> resolves true, no Where merge needed by the caller', async () => {
    const fn: AccessFn = () => true
    await expect(executeAccess(fn, { req: reqWithUser({ id: 1, roles: ['admin'] }) })).resolves.toBe(true)
  })

  it('access fn returns `false` -> throws Forbidden', async () => {
    const fn: AccessFn = () => false
    await expect(executeAccess(fn, { req: anonReq })).rejects.toThrow(Forbidden)
  })

  it('access fn returns a Where object -> resolves with that exact object (for the caller to combineQueries)', async () => {
    const where: Where = { customer: { equals: 7 } }
    const fn: AccessFn = () => where
    await expect(executeAccess(fn, { req: reqWithUser({ id: 7 }) })).resolves.toEqual(where)
  })

  it('async access fn is awaited', async () => {
    const fn: AccessFn = async () => {
      await Promise.resolve()
      return { done: { equals: true } }
    }
    await expect(executeAccess(fn, { req: anonReq })).resolves.toEqual({ done: { equals: true } })
  })

  it('no access fn configured, req.user present -> default allow (true)', async () => {
    await expect(executeAccess(undefined, { req: reqWithUser({ id: 1 }) })).resolves.toBe(true)
  })

  it('no access fn configured, no req.user -> default deny, throws Forbidden', async () => {
    await expect(executeAccess(undefined, { req: anonReq })).rejects.toThrow(Forbidden)
  })

  it('disableErrors: true, falsy result -> returns the falsy value instead of throwing', async () => {
    const fn: AccessFn = () => false
    await expect(executeAccess(fn, { req: anonReq, disableErrors: true })).resolves.toBe(false)
  })

  it('disableErrors: true, no access fn configured, no user -> returns false instead of throwing', async () => {
    await expect(executeAccess(undefined, { req: anonReq, disableErrors: true })).resolves.toBe(false)
  })

  it('disableErrors: true does not suppress a truthy/Where result - still returned as-is', async () => {
    const where: Where = { a: { equals: 1 } }
    const fn: AccessFn = () => where
    await expect(executeAccess(fn, { req: anonReq, disableErrors: true })).resolves.toEqual(where)
  })

  it('passes id/data/isReadingStaticFile through to the access fn unchanged', async () => {
    const fn = vi.fn(() => true) as AccessFn
    const req = reqWithUser({ id: 1 })
    await executeAccess(fn, { req, id: 42, data: { title: 'x' }, isReadingStaticFile: true })
    expect(fn).toHaveBeenCalledWith({ id: 42, data: { title: 'x' }, isReadingStaticFile: true, req })
  })

  it('isReadingStaticFile defaults to false when omitted', async () => {
    const fn = vi.fn(() => true) as AccessFn
    const req = anonReq
    await executeAccess(fn, { req })
    expect(fn).toHaveBeenCalledWith({ id: undefined, data: undefined, isReadingStaticFile: false, req })
  })
})

describe('executeFieldAccess', () => {
  it('no access fn configured -> true (unlike collection-level, which defaults to "must be logged in")', async () => {
    await expect(executeFieldAccess(undefined, { req: anonReq })).resolves.toBe(true)
  })

  it('access fn returns true -> true', async () => {
    const fn: FieldAccessFn = () => true
    await expect(executeFieldAccess(fn, { req: reqWithUser({ id: 1, roles: ['admin'] }) })).resolves.toBe(true)
  })

  it('access fn returns false -> false, never throws', async () => {
    const fn: FieldAccessFn = () => false
    await expect(executeFieldAccess(fn, { req: anonReq })).resolves.toBe(false)
  })

  it('a falsy non-boolean return is coerced to false (real Payload only declares boolean, but a misbehaving fn should not crash the pipeline)', async () => {
    const brokenFn = (): undefined => undefined
    const fn = brokenFn as unknown as FieldAccessFn
    await expect(executeFieldAccess(fn, { req: anonReq })).resolves.toBe(false)
  })

  it('async field access fn is awaited', async () => {
    const fn: FieldAccessFn = async () => {
      await Promise.resolve()
      return true
    }
    await expect(executeFieldAccess(fn, { req: anonReq })).resolves.toBe(true)
  })

  it('passes id/data/doc/siblingData/blockData through unchanged', async () => {
    const fn = vi.fn(() => true) as FieldAccessFn
    const req = reqWithUser({ id: 1, roles: ['admin'] })
    await executeFieldAccess(fn, { req, id: 5, data: { roles: ['admin'] }, doc: { roles: ['customer'] }, siblingData: { roles: ['admin'] }, blockData: undefined })
    expect(fn).toHaveBeenCalledWith({
      id: 5,
      data: { roles: ['admin'] },
      doc: { roles: ['customer'] },
      siblingData: { roles: ['admin'] },
      blockData: undefined,
      req,
    })
  })
})

describe('Forbidden', () => {
  it('is a real Error subclass with a plain-English default message', () => {
    const err = new Forbidden()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('Forbidden')
    expect(err.message).toBe('You are not allowed to perform this action.')
  })
})
