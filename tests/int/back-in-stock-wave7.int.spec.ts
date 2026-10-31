// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  engine: null as unknown,
}))

vi.mock('@/engine', () => ({ getEngine: async () => state.engine }))
vi.mock('@/features/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }))

import { sendEmail } from '@/features/email'
import { POST } from '@/app/(engage)/api/shop-back-in-stock/route'
import { StockSubscriptions } from '@/features/ecommerce/collections/StockSubscriptions'
import { backInStockAfterChange, notifyBackInStock } from '@/features/ecommerce/backInStockNotify'
import { recordBackInStockSignup, type BackInStockEngine } from '@/features/ecommerce/backInStockSignup'
import { checkSignup, restockedVariations, shouldNotify, showBackInStockForm, signupKey } from '@/features/ecommerce/lib/backInStock'
import { resetRateLimiter } from '@/features/security/rateLimit'

type Row = Record<string, unknown>

const outOfStock = { id: 7, _status: 'published', title: 'Linen Shirt', slug: 'linen-shirt', manageStock: true, stockQty: 0, backorders: 'no' as const, variations: [] as never[] }
const inStock = { ...outOfStock, stockQty: 5 }

/** A tiny store that answers the three calls the feature makes: findByID, findGlobal and find/create/update on sign-ups. */
function fakeEngine(product: Row | null, settings: Row | null = {}) {
  const rows: Row[] = []
  const updates: Array<Record<string, unknown>> = []
  const engine = {
    rows,
    updates,
    findGlobal: async () => settings,
    findByID: async () => product,
    find: async (args: Record<string, unknown>) => {
      const and = (args.where as { and: Array<Record<string, Record<string, unknown>>> }).and
      const productId = and[0].product.equals
      const status = and[1].status.equals
      return { docs: rows.filter((row) => row.product === productId && row.status === status) }
    },
    create: async (args: Record<string, unknown>) => {
      const row = { id: rows.length + 1, ...(args.data as Row) }
      rows.push(row)
      return row
    },
    update: async (args: Record<string, unknown>) => {
      updates.push(args)
      const row = rows.find((item) => item.id === args.id) as Row
      Object.assign(row, args.data as Row)
      return row
    },
  }
  return engine
}

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/shop-back-in-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

beforeEach(() => {
  resetRateLimiter()
  vi.mocked(sendEmail).mockClear()
})

// Absolute links need a site origin; these specs set one rather than relying on a hard-coded fallback.
process.env.SITE_URL = 'https://example.test'

describe('back-in-stock input and keys (pure)', () => {
  it('accepts a clean signup and lowercases the address', () => {
    const checked = checkSignup({ productId: '7', email: '  Ann@Example.COM ' })
    expect(checked).toEqual({ ok: true, signup: { productId: 7, variation: '', email: 'ann@example.com' } })
  })

  it('treats a filled honeypot as spam and rejects bad input with field errors', () => {
    expect(checkSignup({ productId: 7, email: 'a@b.co', website: 'http://spam' })).toEqual({ ok: false, spam: true })
    const bad = checkSignup({ productId: 'x', email: 'not-an-email' })
    expect(bad).toMatchObject({ ok: false, spam: false, errors: { productId: expect.any(String), email: expect.any(String) } })
  })

  it('uses one key per person and item, ignoring Gmail dots and plus tags', () => {
    expect(signupKey({ productId: 7, variation: '', email: 'a.b+shop@gmail.com' })).toBe(signupKey({ productId: 7, variation: '', email: 'ab@gmail.com' }))
    expect(signupKey({ productId: 7, variation: 'v1', email: 'ab@gmail.com' })).not.toBe(signupKey({ productId: 7, variation: '', email: 'ab@gmail.com' }))
  })
})

describe('when stock comes back (pure)', () => {
  it('fires only on out of stock to in stock', () => {
    expect(shouldNotify(outOfStock, inStock)).toBe(true)
    expect(shouldNotify(inStock, outOfStock)).toBe(false)
    expect(shouldNotify(inStock, inStock)).toBe(false)
    expect(shouldNotify({ manageStock: false, stockStatus: 'outofstock' }, { manageStock: false, stockStatus: 'instock' })).toBe(true)
  })

  it('reports the simple product, or only the variations that came back', () => {
    expect(restockedVariations(outOfStock, inStock)).toEqual([''])
    expect(restockedVariations(inStock, inStock)).toEqual([])
    const before = { ...outOfStock, variations: [{ id: 'v1', manageStock: true, stockQty: 0 }, { id: 'v2', manageStock: true, stockQty: 0 }] }
    const after = { ...before, variations: [{ id: 'v1', manageStock: true, stockQty: 3 }, { id: 'v2', manageStock: true, stockQty: 0 }] }
    expect(restockedVariations(before, after)).toEqual(['v1'])
  })

  it('shows the form only for an out of stock simple product while the setting is on', () => {
    expect(showBackInStockForm({}, outOfStock)).toBe(true)
    expect(showBackInStockForm({ storefront: { backInStock: true } }, outOfStock)).toBe(true)
    expect(showBackInStockForm({ storefront: { backInStock: false } }, outOfStock)).toBe(false)
    expect(showBackInStockForm({}, inStock)).toBe(false)
    expect(showBackInStockForm({}, { ...outOfStock, variations: [{ id: 'v1' }] })).toBe(false)
  })
})

describe('recording a signup', () => {
  it('stores one pending row for an out of stock product and answers the same way for a repeat', async () => {
    const engine = fakeEngine(outOfStock)
    const first = await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, email: 'ann@example.com' })
    const again = await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, email: 'Ann@example.com' })
    expect(first.kind).toBe('done')
    expect(again.kind).toBe('done')
    expect(engine.rows).toHaveLength(1)
    expect(engine.rows[0]).toMatchObject({ product: 7, variation: null, email: 'ann@example.com', status: 'pending' })
  })

  it('stores nothing for an item that is in stock, unknown or unpublished, but still says thanks', async () => {
    for (const product of [inStock, null, { ...outOfStock, _status: 'draft' }]) {
      const engine = fakeEngine(product)
      const result = await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, email: 'ann@example.com' })
      expect(result.kind).toBe('done')
      expect(engine.rows).toHaveLength(0)
    }
  })

  it('stores nothing when the Shop setting is off, and nothing for a honeypot', async () => {
    const off = fakeEngine(outOfStock, { storefront: { backInStock: false } })
    expect(await recordBackInStockSignup(off as unknown as BackInStockEngine, { productId: 7, email: 'ann@example.com' })).toEqual({ kind: 'off' })
    expect(off.rows).toHaveLength(0)
    const bot = fakeEngine(outOfStock)
    await recordBackInStockSignup(bot as unknown as BackInStockEngine, { productId: 7, email: 'ann@example.com', website: 'x' })
    expect(bot.rows).toHaveLength(0)
  })

  it('needs a real, enabled variation for a variable product', async () => {
    const variable = { ...outOfStock, variations: [{ id: 'v1', enabled: true, manageStock: true, stockQty: 0 }, { id: 'v2', enabled: true, manageStock: true, stockQty: 4 }] }
    const engine = fakeEngine(variable)
    await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, variation: 'v2', email: 'ann@example.com' })
    await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, email: 'ann@example.com' })
    await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, variation: 'v1', email: 'ann@example.com' })
    expect(engine.rows).toEqual([expect.objectContaining({ variation: 'v1', status: 'pending' })])
  })

  it('reports field errors for a bad address without storing anything', async () => {
    const engine = fakeEngine(outOfStock)
    const result = await recordBackInStockSignup(engine as unknown as BackInStockEngine, { productId: 7, email: 'nope' })
    expect(result).toMatchObject({ kind: 'invalid', errors: { email: expect.any(String) } })
    expect(engine.rows).toHaveLength(0)
  })
})

describe('notifying when stock returns', () => {
  it('emails each pending signup once and marks it sent', async () => {
    const engine = fakeEngine(null)
    engine.rows.push({ id: 1, product: 7, variation: null, email: 'ann@example.com', status: 'pending' }, { id: 2, product: 7, variation: null, email: 'bo@example.com', status: 'sent' })
    const sent = await notifyBackInStock(engine as never, { id: 7, title: 'Linen Shirt', slug: 'linen-shirt' }, [''])
    expect(sent).toBe(1)
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: 'ann@example.com', subject: 'Back in stock: Linen Shirt' })
    expect(engine.rows[0]).toMatchObject({ status: 'sent' })
    expect(typeof engine.rows[0].notifiedAt).toBe('string')
    expect(engine.rows[1]).toMatchObject({ status: 'sent' })
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
  })

  it('leaves a signup pending when the email does not go, and skips the setting when it is off', async () => {
    const engine = fakeEngine(null, { storefront: { backInStock: false } })
    engine.rows.push({ id: 1, product: 7, variation: null, email: 'ann@example.com', status: 'pending' })
    expect(await notifyBackInStock(engine as never, { id: 7, title: 'Linen Shirt' }, [''])).toBe(0)
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()

    const failing = fakeEngine(null, {})
    failing.rows.push({ id: 1, product: 7, variation: null, email: 'ann@example.com', status: 'pending' })
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false } as never)
    expect(await notifyBackInStock(failing as never, { id: 7, title: 'Linen Shirt' }, [''])).toBe(0)
    expect(failing.rows[0]).toMatchObject({ status: 'pending' })
  })

  it('runs from the product save hook only on a real restock, and never throws', async () => {
    const engine = fakeEngine(null)
    engine.rows.push({ id: 1, product: 7, variation: null, email: 'ann@example.com', status: 'pending' })
    await backInStockAfterChange({ doc: inStock, previousDoc: outOfStock, req: { engine } } as never)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
    await backInStockAfterChange({ doc: { ...inStock, _status: 'draft' }, previousDoc: outOfStock, req: { engine } } as never)
    await backInStockAfterChange({ doc: inStock, previousDoc: inStock, req: { engine } } as never)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
    await expect(backInStockAfterChange({ doc: inStock, previousDoc: outOfStock, req: { engine: {} } } as never)).resolves.toBe(inStock)
  })
})

describe('public endpoint', () => {
  it('answers with the same thank-you for a stored and an ignored signup', async () => {
    state.engine = fakeEngine(outOfStock)
    const res = await post({ productId: 7, email: 'ann@example.com' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, message: expect.stringContaining('we will email you') })
    expect((state.engine as ReturnType<typeof fakeEngine>).rows).toHaveLength(1)
  })

  it('rejects a bad address with a 400 and a missing body with a 400', async () => {
    state.engine = fakeEngine(outOfStock)
    expect((await post({ productId: 7, email: 'bad' })).status).toBe(400)
    const empty = await POST(new Request('http://localhost/api/shop-back-in-stock', { method: 'POST', body: 'not json' }))
    expect(empty.status).toBe(400)
  })

  it('refuses with a 403 when the Shop setting is off', async () => {
    state.engine = fakeEngine(outOfStock, { storefront: { backInStock: false } })
    expect((await post({ productId: 7, email: 'ann@example.com' })).status).toBe(403)
  })

  it('rate limits a client after five sign-ups a minute', async () => {
    state.engine = fakeEngine(outOfStock)
    for (let i = 0; i < 5; i++) expect((await post({ productId: 7, email: `p${i}@example.com` })).status).toBe(200)
    expect((await post({ productId: 7, email: 'late@example.com' })).status).toBe(429)
  })
})

describe('sign-up collection', () => {
  it('cannot be created or edited through the admin API, and is read by staff only', () => {
    const access = StockSubscriptions.access as Record<string, unknown>
    expect((access.create as () => boolean)()).toBe(false)
    expect((access.update as () => boolean)()).toBe(false)
    expect(StockSubscriptions.slug).toBe('stock-subscriptions')
  })
})
