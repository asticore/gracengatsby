// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

import { ensureMigratedLocalDb } from '../helpers/migratedDb'

import { drizzle } from 'drizzle-orm/d1'

import { resolveD1Binding } from '@/cms/db/connect'
import { createEngine, type Engine } from '@/localapi/engine'
import { consoleLogger } from '@/localapi/logger'
import { up as catalogueUp } from '@/migrations/20261013_120000_shop_catalogue'
import { exportCatalogueCsv, runProductImport } from '@/features/ecommerce/server/csvImport'
import { reviewEndpoint } from '@/features/ecommerce/reviewEndpoint'
import { beforeChangeCart } from '@/features/ecommerce/hooks/cartHooks'

type Doc = Record<string, any> & { id: number }

describe('shop catalogue against a real engine and database', () => {
  let engine: Engine
  const tag = `t${Date.now()}`
  const productIds: number[] = []
  const reviewIds: number[] = []
  const e = () => engine as unknown as {
    create: (a: unknown) => Promise<Doc>
    update: (a: unknown) => Promise<Doc>
    findByID: (a: unknown) => Promise<Doc | null>
    find: (a: unknown) => Promise<{ docs: Doc[] }>
    delete: (a: unknown) => Promise<unknown>
  }

  beforeAll(async () => {
    await ensureMigratedLocalDb()
    // A developer database that applied the empty placeholder of this migration earlier will not
    // run it again; the migration is idempotent, so catch it up here.
    const d1 = await resolveD1Binding()
    const cols = (await d1.prepare('PRAGMA table_info(`eg_products`)').all()).results as { name: string }[]
    if (!cols.some((c) => c.name === 'product_type')) await catalogueUp({ db: drizzle(d1) as never, engine: { logger: consoleLogger } } as never)
    engine = createEngine()
  }, 300_000)

  afterAll(async () => {
    for (const id of reviewIds) await e().delete({ collection: 'product-reviews', id, overrideAccess: true }).catch((): void => undefined)
    for (const id of productIds) await e().delete({ collection: 'products', id, overrideAccess: true }).catch((): void => undefined)
  })

  const makeProduct = async (data: Record<string, unknown>) => {
    const doc = await e().create({ collection: 'products', data: { _status: 'published', ...data }, overrideAccess: true, draft: false })
    productIds.push(doc.id)
    return doc
  }

  it('stores a variable product with attributes, variations, links and keeps variation ids stable', async () => {
    const other = await makeProduct({ title: `Other ${tag}`, slug: `other-${tag}`, priceInAUD: 5 })
    const cls = await e().create({ collection: 'shipping-classes', data: { name: `Bulky ${tag}` }, overrideAccess: true })
    expect(cls.slug).toBe(`bulky-${tag}`)
    const doc = await makeProduct({
      title: `Tee ${tag}`,
      slug: `tee-${tag}`,
      productType: 'variable',
      priceInAUD: 50,
      sku: `TEE-${tag}`,
      shippingClass: cls.id,
      upsells: [other.id],
      attributes: [{ name: 'Size', values: 'S|M', forVariations: true, visible: true }],
      variations: [
        { attributeValues: 'Size=S', sku: `TEE-S-${tag}`, priceInAUD: 45, manageStock: true, stockQty: 3, enabled: true },
        { attributeValues: 'Size=M', sku: `TEE-M-${tag}`, manageStock: true, stockQty: 0, backorders: 'no', enabled: true },
      ],
    })
    const read = (await e().findByID({ collection: 'products', id: doc.id, depth: 0, overrideAccess: true, draft: false }))!
    expect(read.productType).toBe('variable')
    expect(read.variations).toHaveLength(2)
    expect(read.variations[0]).toMatchObject({ attributeValues: 'Size=S', sku: `TEE-S-${tag}`, stockStatus: 'instock' })
    expect(read.variations[1].stockStatus).toBe('outofstock')
    expect(read.attributes[0]).toMatchObject({ name: 'Size', forVariations: true })
    expect(read.upsells.map((u: unknown) => (typeof u === 'object' ? (u as Doc).id : u))).toEqual([other.id])
    expect(read.shippingClass).toBe(cls.id)
    const ids = read.variations.map((v: Doc) => v.id)
    await e().update({ collection: 'products', id: doc.id, data: { variations: read.variations }, overrideAccess: true, draft: false })
    const again = (await e().findByID({ collection: 'products', id: doc.id, depth: 0, overrideAccess: true, draft: false }))!
    expect(again.variations.map((v: Doc) => v.id)).toEqual(ids)
    await e().delete({ collection: 'shipping-classes', id: cls.id, overrideAccess: true }).catch((): void => undefined)
  })

  it('refuses a SKU another product already uses, including a variation SKU', async () => {
    await makeProduct({ title: `A ${tag}`, slug: `a-${tag}`, sku: `DUP-${tag}`, priceInAUD: 1 })
    await expect(makeProduct({ title: `B ${tag}`, slug: `b-${tag}`, sku: `dup-${tag}`, priceInAUD: 1 })).rejects.toThrow()
    await expect(
      makeProduct({ title: `C ${tag}`, slug: `c-${tag}`, productType: 'variable', priceInAUD: 1, variations: [{ attributeValues: 'X=1', sku: `DUP-${tag}` }] }),
    ).rejects.toThrow()
  })

  it('moderation drives the cached rating: only approved reviews count', async () => {
    const product = await makeProduct({ title: `Rated ${tag}`, slug: `rated-${tag}`, priceInAUD: 3 })
    const review = async (rating: number, status: string) => {
      const doc = await e().create({ collection: 'product-reviews', data: { product: product.id, name: 'Ann', email: `${rating}${status}@x.co`, rating, text: 'Great stuff', status }, overrideAccess: true })
      reviewIds.push(doc.id)
      return doc
    }
    const five = await review(5, 'pending')
    await review(3, 'approved')
    await review(1, 'spam')
    const rating = async () => (await e().findByID({ collection: 'products', id: product.id, depth: 0, overrideAccess: true, draft: false }))!
    expect(await rating()).toMatchObject({ ratingAverage: 3, ratingCount: 1 })
    await e().update({ collection: 'product-reviews', id: five.id, data: { status: 'approved' }, overrideAccess: true })
    expect(await rating()).toMatchObject({ ratingAverage: 4, ratingCount: 2 })
    await e().update({ collection: 'product-reviews', id: five.id, data: { status: 'spam' }, overrideAccess: true })
    expect(await rating()).toMatchObject({ ratingAverage: 3, ratingCount: 1 })
  })

  it('the public submit endpoint stores a pending review, traps the honeypot and flags verified owners', async () => {
    const product = await makeProduct({ title: `Submit ${tag}`, slug: `submit-${tag}`, priceInAUD: 3 })
    const post = (body: unknown, ip: string) =>
      reviewEndpoint.handler({ engine, json: async () => body, headers: new Headers({ 'cf-connecting-ip': ip }) } as never) as Promise<Response>
    const ok = await post({ product: product.id, name: 'Bo', email: `bo-${tag}@x.co`, rating: 4, text: 'Nice one' }, '10.0.0.1')
    expect(ok.status).toBe(201)
    const stored = (await e().find({ collection: 'product-reviews', where: { product: { equals: product.id } }, overrideAccess: true, depth: 0 })).docs
    stored.forEach((doc) => reviewIds.push(doc.id))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ status: 'pending', rating: 4 })
    const duplicate = await post({ product: product.id, name: 'Bo', email: `bo-${tag}@x.co`, rating: 4, text: 'Nice one' }, '10.0.0.2')
    expect(duplicate.status).toBe(409)
    const bot = await post({ product: product.id, name: 'Bot', email: `bot-${tag}@x.co`, rating: 5, text: 'buy now', website: 'x' }, '10.0.0.3')
    expect(bot.status).toBe(200)
    expect((await e().find({ collection: 'product-reviews', where: { product: { equals: product.id } }, overrideAccess: true, depth: 0 })).docs).toHaveLength(1)
    const invalid = await post({ product: product.id, name: '', email: 'nope', rating: 9, text: '' }, '10.0.0.4')
    expect(invalid.status).toBe(400)
  })

  it('the cart hook prices from the database and refuses unavailable lines', async () => {
    const product = await makeProduct({
      title: `Cart ${tag}`,
      slug: `cart-${tag}`,
      productType: 'variable',
      priceInAUD: 20,
      attributes: [{ name: 'Size', values: 'S', forVariations: true }],
      variations: [{ attributeValues: 'Size=S', priceInAUD: 25, manageStock: true, stockQty: 2, enabled: true }],
    })
    const read = (await e().findByID({ collection: 'products', id: product.id, depth: 0, overrideAccess: true, draft: false }))!
    const variationId = read.variations[0].id as string
    const run = (items: unknown[]) => beforeChangeCart({ data: { items, subtotal: 1 }, operation: 'update', req: { engine } } as never)
    expect((await run([{ product: product.id, variation: variationId, quantity: 2 }])).subtotal).toBe(50)
    await expect(run([{ product: product.id, variation: variationId, quantity: 3 }])).rejects.toThrow()
    await expect(run([{ product: product.id, quantity: 1 }])).rejects.toThrow()
    await expect(run([{ product: product.id, variation: 'forged', quantity: 1 }])).rejects.toThrow()
  })

  it('imports a CSV by SKU with a dry run first, then updates and creates', async () => {
    const sku = `CSV-${tag}`
    const csv =
      'Type,SKU,Parent SKU,Name,Published,Regular price,Stock,Manage stock,Attribute 1 name,Attribute 1 value(s),Attribute 1 variation\n' +
      `variable,${sku},,CSV Tee ${tag},1,40,,,Size,S | M,1\n` +
      `variation,${sku}-S,${sku},,,42,5,1,Size,S,\n` +
      `simple,CSV-X-${tag},,=Evil ${tag},0,9.5,,,,,\n`
    const preview = await runProductImport(engine as never, csv, { dryRun: true })
    expect(preview).toMatchObject({ dryRun: true, created: 2, updated: 0, failed: 0 })
    expect((await e().find({ collection: 'products', where: { sku: { equals: sku } }, overrideAccess: true, depth: 0 })).docs).toHaveLength(0)

    const run = await runProductImport(engine as never, csv, { dryRun: false })
    expect(run).toMatchObject({ created: 2, failed: 0 })
    const created = (await e().find({ collection: 'products', where: { sku: { equals: sku } }, overrideAccess: true, depth: 0, draft: false })).docs
    created.forEach((doc) => productIds.push(doc.id))
    expect(created[0].variations[0]).toMatchObject({ sku: `${sku}-S`, priceInAUD: 42, stockQty: 5 })
    const evil = (await e().find({ collection: 'products', where: { sku: { equals: `CSV-X-${tag}` } }, overrideAccess: true, depth: 0, draft: false })).docs
    evil.forEach((doc) => productIds.push(doc.id))
    expect(evil[0].title).toBe(`=Evil ${tag}`)

    // Same file again: matched by SKU, so everything is an update.
    const second = await runProductImport(engine as never, csv, { dryRun: false })
    expect(second).toMatchObject({ created: 0, updated: 2, failed: 0 })
    expect((await e().find({ collection: 'products', where: { sku: { equals: sku } }, overrideAccess: true, depth: 0, draft: false })).docs[0].variations).toHaveLength(1)

    const exported = await exportCatalogueCsv(engine as never)
    expect(exported).toContain(sku)
    expect(exported).toContain(`'=Evil ${tag}`)

    const bad = await runProductImport(engine as never, 'Type,SKU,Name\nsimple,,No sku\nvariation,ZZZ,,\n', { dryRun: true })
    expect(bad.errors.length).toBeGreaterThan(0)
  })
})
