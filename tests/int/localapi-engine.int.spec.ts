// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// STAGE 6c PROOF: `src/localapi/engine.ts`'s `createEngine()` - the actual
// object a future `getEngine()` will return post-cutover - matches real
// `getEngine()`'s behavior across every one of the thirteen confirmed real
// call-site methods (see engine.ts's own header for the grep that found
// them). This is a representative smoke pass through `createEngine()`
// ITSELF (not the underlying registries/localapi modules directly, which
// Stage 1-6a's own suites already prove) - Stage 6d generalizes the
// find/count coverage here to all 21 collections + 17 globals; this suite's
// job is proving the FACTORY's wiring (slug lookup, toLocalReq, secret
// derivation, db.migrate plumbing) is correct at all, using one or two
// representative entities per method.
import type { RealEngine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteTranslation } from '@/cms/db'
import { migrations } from '@/migrations'
import { createEngine, type Engine } from '@/localapi/engine'

describe('localapi/engine - createEngine() read-side parity vs real getEngine()', () => {
  let real: RealEngine
  let ours: Engine

  beforeAll(async () => {
    real = await getEngine()
    ours = createEngine()
  })

  it('find(): faqs (plain collection) matches real engine.find()', async () => {
    const viaReal = (await real.find({ collection: 'faqs' as never, overrideAccess: true, sort: 'id', limit: 5 })) as { docs: { id: number }[]; totalDocs: number }
    const viaOurs = await ours.find({ collection: 'faqs', overrideAccess: true, sort: 'id', limit: 5 })
    expect(viaOurs.totalDocs).toBe(viaReal.totalDocs)
    expect(viaOurs.docs.map((d) => d.id).sort()).toEqual(viaReal.docs.map((d) => d.id).sort())
  })

  it('count(): faqs matches real engine.count()', async () => {
    const viaReal = await real.count({ collection: 'faqs' as never, overrideAccess: true })
    const viaOurs = await ours.count({ collection: 'faqs', overrideAccess: true })
    expect(viaOurs.totalDocs).toBe(viaReal.totalDocs)
  })

  it('findByID(): events (versioned, draft) matches real engine.findByID()', async () => {
    const list = (await real.find({ collection: 'events' as never, overrideAccess: true, limit: 1 })) as { docs: { id: number }[] }
    const id = list.docs[0]?.id
    if (id === undefined) return // dev DB has no events yet - nothing to compare
    const viaReal = await real.findByID({ collection: 'events' as never, id, overrideAccess: true, draft: true })
    const viaOurs = await ours.findByID({ collection: 'events', id, overrideAccess: true, draft: true })
    expect((viaOurs as { id?: number } | null)?.id).toBe((viaReal as { id?: number } | null)?.id)
  })

  it('findGlobal(): payment-settings matches real engine.findGlobal()', async () => {
    const viaReal = await real.findGlobal({ slug: 'payment-settings' as never, overrideAccess: true })
    const viaOurs = await ours.findGlobal({ slug: 'payment-settings', overrideAccess: true })
    if (viaReal && (viaReal as { id?: unknown }).id !== undefined) {
      expect((viaOurs as { id?: unknown } | null)?.id).toBe((viaReal as { id?: unknown }).id)
    }
  })

  it('.config / .collections are populated the same way Stage 4 already proved standalone', async () => {
    expect(ours.config.routes.admin).toBe(real.config.routes.admin)
    expect(ours.config.serverURL).toBe(real.config.serverURL)
    expect(ours.collections.users?.config.auth).toBeTruthy()
  })
})

describe('localapi/engine - createEngine() write-side wiring proof (translations)', () => {
  let ours: Engine
  const createdIds: number[] = []

  beforeAll(() => {
    ours = createEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) await deleteTranslation(id).catch(() => {})
  })

  it('rejects a missing required field (ValidationError-shaped rejection)', async () => {
    await expect(ours.create({ collection: 'translations', data: {}, overrideAccess: true })).rejects.toThrow()
  })

  it('denies an anonymous create (admin-only collection)', async () => {
    await expect(
      ours.create({ collection: 'translations', data: { locale: 'de', sourceKind: 'interface', sourceId: 'ui', fieldPath: 'nav.about' } }),
    ).rejects.toThrow()
  })

  it('creates, updates, and deletes a real row through createEngine() itself', async () => {
    const created = await ours.create({
      collection: 'translations',
      data: { locale: 'de', sourceKind: 'interface', sourceId: 'ui', fieldPath: 'nav.about', value: 'Über uns' },
      user: { id: 999903, roles: ['admin'] },
      overrideAccess: true,
    })
    createdIds.push(created.id as number)
    expect(created.value).toBe('Über uns')

    const updated = await ours.update({ collection: 'translations', id: created.id as number, data: { value: 'Über uns (v2)' }, user: { id: 999903, roles: ['admin'] }, overrideAccess: true })
    expect((updated as { value?: string } | null)?.value).toBe('Über uns (v2)')

    const deleted = await ours.delete({ collection: 'translations', id: created.id as number, user: { id: 999903, roles: ['admin'] }, overrideAccess: true })
    expect(deleted.id).toBe(created.id)
  })
})

describe('localapi/engine - createEngine() auth-side wiring proof', () => {
  let real: RealEngine
  let ours: Engine
  let realUserId: number | undefined
  const email = `engine-stage6c-${Date.now()}@example.com`
  const password = 'correct horse battery staple 42'

  beforeAll(async () => {
    real = await getEngine()
    ours = createEngine()
    const created = (await real.create({ collection: 'users' as never, data: { email, password, roles: ['admin'] } as never, overrideAccess: true })) as { id: number }
    realUserId = created.id
  })

  afterAll(async () => {
    if (realUserId !== undefined) await real.delete({ collection: 'users' as never, id: realUserId, overrideAccess: true }).catch(() => {})
  })

  it('login(): succeeds for a real user created via the real engine, fails for a wrong password', async () => {
    const result = await ours.login({ collection: 'users', data: { email, password } })
    expect(result.user.email).toBe(email)
    expect(result.token).toBeTruthy()

    await expect(ours.login({ collection: 'users', data: { email, password: 'nope' } })).rejects.toThrow()
  })

  it('auth(): verifies a token minted by our own login()', async () => {
    const loginResult = await ours.login({ collection: 'users', data: { email, password } })
    const headers = { get: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${loginResult.token}` : null) }
    const verified = await ours.auth({ headers })
    expect(verified.user?.email).toBe(email)
  })

  it('forgotPassword()/resetPassword(): mints a token and a subsequent reset changes the password', async () => {
    const token = await ours.forgotPassword({ collection: 'users', data: { email } })
    expect(token).toBeTruthy()

    const newPassword = 'a different correct horse 99'
    await ours.resetPassword({ collection: 'users', data: { password: newPassword, token: token as string }, overrideAccess: true })

    const relogin = await ours.login({ collection: 'users', data: { email, password: newPassword } })
    expect(relogin.user.email).toBe(email)
  })
})

describe('localapi/engine - createEngine() carts `status` virtual field (Stage 10 Ecommerce, Layer 2)', () => {
  // Proves the field-level afterRead hook actually fires through this app's
  // own read path (src/localapi/read-operations.ts's traverseField) for a
  // `virtual: true` field with no DB column - see Carts.ts's own header
  // comment for why this needed no collection-level engine change, only the
  // schema generator's virtual-field skip (src/cms/db/schema/generate.ts).
  let ours: Engine
  const createdIds: number[] = []

  beforeAll(() => {
    ours = createEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) await ours.delete({ collection: 'carts', id, overrideAccess: true }).catch(() => {})
  })

  it('a freshly created cart (no purchasedAt) reads back status "active"', async () => {
    const created = await ours.create({ collection: 'carts', data: {}, overrideAccess: true })
    createdIds.push(created.id as number)
    expect((created as { status?: string }).status).toBe('active')

    const viaFindByID = await ours.findByID({ collection: 'carts', id: created.id as number, overrideAccess: true })
    expect((viaFindByID as { status?: string } | null)?.status).toBe('active')
  })

  it('a cart with purchasedAt set reads back status "purchased"', async () => {
    const created = await ours.create({ collection: 'carts', data: { purchasedAt: new Date().toISOString() }, overrideAccess: true })
    createdIds.push(created.id as number)
    expect((created as { status?: string }).status).toBe('purchased')
  })

  it('does not persist a real "status" column - a cart round-trips through the DB-level createCart/findCartByID with no status key at all', async () => {
    const { createCart, deleteCart, findCartByID } = await import('@/cms/db')
    const ours2 = await createCart({} as never)
    try {
      expect(ours2).not.toHaveProperty('status')
      const viaDb = await findCartByID(ours2.id)
      expect(viaDb).not.toHaveProperty('status')
    } finally {
      await deleteCart(ours2.id)
    }
  })
})

describe('localapi/engine - createEngine() db.migrate wiring proof', () => {
  it('skips an already-applied migration against the real, live dev D1 rather than re-running it', async () => {
    const ours = createEngine()
    const first = migrations[0]
    if (!first) return
    const result = await ours.db.migrate({ migrations: [first] as never })
    expect(result.skipped).toEqual([first.name])
    expect(result.ran).toEqual([])
  })
})
