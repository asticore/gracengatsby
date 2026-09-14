// @vitest-environment node
// This suite includes real-hook integration cases (checkEventCapacity's real
// req.payload.find/findByID calls against a live D1 db) alongside plain
// mock-hook unit cases, same reasoning as e.g.
// tests/int/cms-db-event-rsvps.int.spec.ts for the ceremony below: needs
// `@/engage.config` to be the side entering the `@/engine` <-> `@/engage.config`
// circular import for Vitest's SSR module runner to resolve it, and the
// 'node' environment (not jsdom, this repo's default) because jsdom's
// separate vm realm breaks wrangler's bundled esbuild. The mock-hook cases
// don't strictly need either, but live in the same file as the real-hook
// ones for cohesion, so they inherit both.
import type { Engine } from '@/engine'
import type { CollectionBeforeChangeHook, FieldHook } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createEvent, createEventRSVP, deleteEvent, deleteEventRSVP } from '@/cms/db'
import { checkEventCapacity } from '@/hooks/checkEventCapacity'
import type { BeforeChangeFieldHookArgs, CollectionBeforeChangeHookArgs } from '@/localapi/hooks'
import { runCollectionHooks, runFieldHook, runFieldHooks } from '@/localapi/hooks'
import { formatSlugHook } from '@/utilities/formatSlug'

/* -------------------------------------------------------------------------- */
/* runCollectionHooks - mock hooks                                            */
/* -------------------------------------------------------------------------- */

describe('localapi/hooks - runCollectionHooks (mock hooks)', () => {
  type Data = { count: number; title: string }

  const baseArgs: CollectionBeforeChangeHookArgs<Data> = {
    collection: null,
    context: {},
    data: { count: 1, title: 'a' },
    operation: 'create',
    originalDoc: undefined,
    req: null,
  }

  it('chains 2+ synchronous hooks in order, each return value feeding the next', async () => {
    const calls: number[] = []
    const addOne = (args: CollectionBeforeChangeHookArgs<Data>): Data => {
      calls.push(args.data!.count!)
      return { ...(args.data as Data), count: args.data!.count! + 1 }
    }
    const timesTen = (args: CollectionBeforeChangeHookArgs<Data>): Data => {
      calls.push(args.data!.count!)
      return { ...(args.data as Data), count: args.data!.count! * 10 }
    }

    const result = await runCollectionHooks([addOne, timesTen], baseArgs, 'data')

    // addOne saw the ORIGINAL count (1), timesTen saw addOne's RESULT (2) -
    // proves each hook's return value becomes the next hook's `data`, not
    // just the last hook's return value winning.
    expect(calls).toEqual([1, 2])
    expect(result).toEqual({ count: 20, title: 'a' })
  })

  it('awaits an async hook before calling the next one', async () => {
    const order: string[] = []
    const asyncHook = async (args: CollectionBeforeChangeHookArgs<Data>): Promise<Data> => {
      order.push('async-start')
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push('async-end')
      return { ...(args.data as Data), title: 'from-async' }
    }
    const syncHook = (args: CollectionBeforeChangeHookArgs<Data>): Data => {
      order.push('sync')
      return args.data as Data
    }

    const result = await runCollectionHooks([asyncHook, syncHook], baseArgs, 'data')

    // If the runner didn't await, 'sync' could interleave before 'async-end'.
    expect(order).toEqual(['async-start', 'async-end', 'sync'])
    expect(result.title).toBe('from-async')
  })

  it('a hook returning nothing keeps the previous value - real Payload\'s `|| data`, not `!== undefined`', async () => {
    const sideEffectOnly = (): undefined => undefined
    const result = await runCollectionHooks([sideEffectOnly], baseArgs, 'data')
    expect(result).toBe(baseArgs.data)
  })

  it('chains on `doc` for an afterChange/afterDelete-shaped args object, not just `data`', async () => {
    type Doc = { id: number; status: string }
    type DocArgs = { collection: unknown; context: Record<string, unknown>; doc: Doc; req: unknown }
    const args: DocArgs = { collection: null, context: {}, doc: { id: 1, status: 'draft' }, req: null }
    const publish = (a: DocArgs): Doc => ({ ...a.doc, status: 'published' })
    const result = await runCollectionHooks([publish], args, 'doc')
    expect(result).toEqual({ id: 1, status: 'published' })
  })

  it('propagates a thrown error and does not run subsequent hooks (no swallowing)', async () => {
    const calls: string[] = []
    const throws = (): Data => {
      calls.push('throws')
      throw new Error('capacity exceeded')
    }
    const neverRuns = (): Data => {
      calls.push('never-runs')
      return baseArgs.data as Data
    }

    await expect(runCollectionHooks([throws, neverRuns], baseArgs, 'data')).rejects.toThrow('capacity exceeded')
    expect(calls).toEqual(['throws'])
  })

  it('returns the input unchanged when the hooks array is empty or undefined', async () => {
    expect(await runCollectionHooks([], baseArgs, 'data')).toBe(baseArgs.data)
    expect(await runCollectionHooks(undefined, baseArgs, 'data')).toBe(baseArgs.data)
  })
})

/* -------------------------------------------------------------------------- */
/* runFieldHook / runFieldHooks - mock hooks                                  */
/* -------------------------------------------------------------------------- */

describe('localapi/hooks - runFieldHook / runFieldHooks (mock hooks)', () => {
  const baseFieldArgs: BeforeChangeFieldHookArgs<Record<string, unknown>, string | undefined, { title: string }> = {
    blockData: undefined,
    collection: null,
    context: {},
    field: {},
    global: null,
    indexPath: [],
    path: ['slug'],
    req: null,
    schemaPath: ['slug'],
    siblingData: { title: 'Hello World' },
    siblingFields: [],
    value: undefined,
  }

  it('returns the hook\'s value when it returns something other than undefined', async () => {
    const hook = (args: typeof baseFieldArgs) => `${args.siblingData.title}-slug`
    const result = await runFieldHook(hook, baseFieldArgs)
    expect(result).toBe('Hello World-slug')
  })

  it('keeps the existing value when the hook returns undefined (field-level `!== undefined`, not `||`)', async () => {
    const hook = (): string | undefined => undefined
    const result = await runFieldHook(hook, { ...baseFieldArgs, value: 'existing-value' })
    expect(result).toBe('existing-value')
  })

  it('an empty string / falsy return WINS over the previous value (unlike the collection-level runner)', async () => {
    // This is the exact real-world case `decryptSecretHook` relies on: a
    // deliberate `''` return on decrypt failure must not be discarded.
    const hook = (): string => ''
    const result = await runFieldHook(hook, { ...baseFieldArgs, value: 'still-encrypted' })
    expect(result).toBe('')
  })

  it('runFieldHooks chains multiple hooks on the same field in order', async () => {
    const upper = (args: typeof baseFieldArgs) => (args.value ?? '').toUpperCase()
    const appendBang = (args: typeof baseFieldArgs) => `${args.value ?? ''}!`
    const result = await runFieldHooks([upper, appendBang], { ...baseFieldArgs, value: 'hi' })
    expect(result).toBe('HI!')
  })
})

/* -------------------------------------------------------------------------- */
/* Real, unmodified hook functions running through the runner                 */
/* -------------------------------------------------------------------------- */

describe('localapi/hooks - real app hook functions, unmodified, running through the runner', () => {
  it('runs the real formatSlugHook (src/utilities/formatSlug.ts) through runFieldHook', async () => {
    const hook = formatSlugHook('title') as FieldHook
    type RealFieldArgs = Parameters<FieldHook>[0]

    const args: RealFieldArgs = {
      blockData: undefined,
      collection: null,
      context: {},
      data: { title: 'Hello World' },
      field: {} as RealFieldArgs['field'],
      global: null,
      indexPath: [],
      operation: 'create',
      overrideAccess: false,
      path: ['slug'],
      previousSiblingDoc: {},
      previousValue: undefined,
      req: {} as RealFieldArgs['req'],
      schemaPath: ['slug'],
      siblingData: { title: 'Hello World' },
      siblingDocWithLocales: {},
      siblingFields: [],
      value: undefined,
    }

    // Blank slug -> falls back to slugifying `data.title` (formatSlug.ts's
    // own documented behavior) - proves the real hook, called through this
    // module's generic runner with no changes to its source, still reads
    // `data`/`value` correctly.
    expect(await runFieldHook(hook, args)).toBe('hello-world')

    // A slug already typed in wins over the title fallback.
    expect(await runFieldHook(hook, { ...args, value: 'Custom Slug!' })).toBe('custom-slug')
  })

  describe('checkEventCapacity (src/hooks/checkEventCapacity.ts) via getEngine()', () => {
    let engine: Engine
    let eventId: number
    const createdRsvpIds: number[] = []

    type RealArgs = Parameters<CollectionBeforeChangeHook>[0]

    const buildArgs = (data: RealArgs['data']): RealArgs => ({
      collection: {} as RealArgs['collection'],
      context: {},
      data,
      operation: 'create',
      originalDoc: {} as RealArgs['originalDoc'],
      // checkEventCapacity only ever reads `req.payload.find`/`req.payload.findByID`
      // (confirmed reading src/hooks/checkEventCapacity.ts directly) - a
      // minimal object exposing the real, live engine as `.payload` is
      // enough; Payload's own `payload.find`/`findByID` build a full
      // `PayloadRequest` internally via `createLocalReq` regardless of what
      // partial `req` they're handed (`utilities/createLocalReq.js`), so
      // this is not a special-case mock, it's how real Payload's Local API
      // already expects to be called.
      req: { payload: engine } as unknown as RealArgs['req'],
    })

    beforeAll(async () => {
      engine = await getEngine()
      const event = await createEvent({
        title: `localapi-hooks-runner capacity test ${Date.now()}`,
        startDate: new Date().toISOString(),
        eventType: 'free',
        capacity: 2,
      })
      eventId = event.id
    })

    afterAll(async () => {
      for (const id of createdRsvpIds) {
        await deleteEventRSVP(id)
      }
      await deleteEvent(eventId)
    })

    it('under capacity: returns data unchanged, does not throw', async () => {
      const args = buildArgs({ event: eventId, guestCount: 1 })
      const result = await runCollectionHooks<RealArgs, 'data'>([checkEventCapacity as CollectionBeforeChangeHook], args, 'data')
      expect(result).toEqual({ event: eventId, guestCount: 1 })
    })

    it('at capacity: the real hook throws, and the runner does not swallow it or run hooks after it', async () => {
      // Seed an existing RSVP directly through this app's own db layer
      // (bypassing Payload's hook pipeline entirely) so the real hook's own
      // `req.payload.find({ collection: 'event-rsvps', ... })` query - which
      // goes through the live engine, wired to the same D1 tables - sees it.
      const seeded = await createEventRSVP({ event: eventId, name: 'Seed guest', email: `seed-${Date.now()}@example.com`, guestCount: 2 })
      createdRsvpIds.push(seeded.id)

      const args = buildArgs({ event: eventId, guestCount: 1 })
      const calls: string[] = []
      const neverRuns: CollectionBeforeChangeHook = (a) => {
        calls.push('never-runs')
        return a.data
      }

      await expect(
        runCollectionHooks<RealArgs, 'data'>([checkEventCapacity as CollectionBeforeChangeHook, neverRuns], args, 'data'),
      ).rejects.toThrow(/at capacity/)
      expect(calls).toEqual([])
    })
  })
})
