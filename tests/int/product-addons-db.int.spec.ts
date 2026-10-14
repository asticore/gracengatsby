// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

import { ensureMigratedLocalDb } from '../helpers/migratedDb'

import { createEngine, type Engine } from '@/localapi/engine'
import { readAddOnChoices } from '@/features/ecommerce/lib/addOns'

type Doc = Record<string, any> & { id: number }

// Product add-ons and the pricing rule switches against a real engine and database: the add-on rows
// must round-trip through the product, the cart hook must price the stored answers, and the rules
// must come back from the shop switches global.
describe('product add-ons and pricing rules against a real engine and database', () => {
  let engine: Engine
  const tag = `a${Date.now()}`
  const productIds: number[] = []
  const cartIds: number[] = []
  const e = () =>
    engine as unknown as {
      create: (a: unknown) => Promise<Doc>
      update: (a: unknown) => Promise<Doc>
      findByID: (a: unknown) => Promise<Doc | null>
      findGlobal: (a: unknown) => Promise<Doc>
      updateGlobal: (a: unknown) => Promise<Doc>
      delete: (a: unknown) => Promise<unknown>
    }

  beforeAll(async () => {
    await ensureMigratedLocalDb()
    engine = createEngine()
  }, 300_000)

  afterAll(async () => {
    for (const id of cartIds) await e().delete({ collection: 'carts', id, overrideAccess: true }).catch((): void => undefined)
    for (const id of productIds) await e().delete({ collection: 'products', id, overrideAccess: true }).catch((): void => undefined)
  })

  it('stores a product with add-on questions and reads them back, and an update replaces them', async () => {
    const doc = await e().create({
      collection: 'products',
      data: {
        _status: 'published',
        title: `Engraved ${tag}`,
        slug: `engraved-${tag}`,
        priceInAUD: 10,
        addOns: [
          { label: 'Engraving', inputType: 'text', price: 2, priceMode: 'fixed', maxLength: 12 },
          { label: 'Gift wrap', inputType: 'checkbox', price: 5 },
        ],
      },
      overrideAccess: true,
      draft: false,
    })
    productIds.push(doc.id)
    const read = await e().findByID({ collection: 'products', id: doc.id, depth: 0, overrideAccess: true })
    const labels = ((read?.addOns as Doc[]) ?? []).map((a) => a.label)
    expect(labels).toEqual(['Engraving', 'Gift wrap'])
    expect((read?.addOns as Doc[])[0]).toMatchObject({ inputType: 'text', price: 2, maxLength: 12 })

    await e().update({ collection: 'products', id: doc.id, data: { addOns: [{ label: 'Note', inputType: 'textarea', price: 0.1, priceMode: 'perCharacter' }] }, overrideAccess: true, draft: false })
    const after = await e().findByID({ collection: 'products', id: doc.id, depth: 0, overrideAccess: true })
    expect(((after?.addOns as Doc[]) ?? []).map((a) => a.label)).toEqual(['Note'])
  })

  it('the cart hook prices the stored answers into the subtotal and keeps only the accepted ones', async () => {
    const doc = await e().create({
      collection: 'products',
      data: { _status: 'published', title: `Cart ${tag}`, slug: `cart-${tag}`, priceInAUD: 10, addOns: [{ label: 'Gift wrap', inputType: 'checkbox', price: 5 }] },
      overrideAccess: true,
      draft: false,
    })
    productIds.push(doc.id)
    const addOnId = ((doc.addOns as Doc[]) ?? [])[0]?.id
    expect(typeof addOnId).toBe('string')
    const cart = await e().create({
      collection: 'carts',
      data: { items: [{ product: doc.id, quantity: 2, addOns: JSON.stringify([{ id: addOnId, value: true }]) }] },
      overrideAccess: true,
    })
    cartIds.push(cart.id)
    expect(cart.subtotal).toBe(2 * (10 + 5))
    const stored = (cart.items as Doc[])[0].addOns as string
    expect(readAddOnChoices(stored)).toEqual([{ id: addOnId, label: 'Gift wrap', value: 'Yes', cents: 500 }])
  })

  it('the shop switches global holds the add-on and pricing rule switches and the rules', async () => {
    const before = await e().findGlobal({ slug: 'shop-extra-settings', depth: 0, overrideAccess: true })
    const original = { addOnsEnabled: before.addOnsEnabled, pricingRulesEnabled: before.pricingRulesEnabled, pricingRules: before.pricingRules }
    try {
      await e().updateGlobal({
        slug: 'shop-extra-settings',
        data: {
          addOnsEnabled: false,
          pricingRulesEnabled: true,
          pricingRules: [{ name: `Bulk ${tag}`, enabled: true, discountType: 'percent', amount: 10, appliesWhen: 'quantity', minQuantity: 10, priority: 1, exclusive: true, showOnProduct: true }],
        },
        overrideAccess: true,
      })
      const saved = await e().findGlobal({ slug: 'shop-extra-settings', depth: 0, overrideAccess: true })
      expect(saved.addOnsEnabled).toBe(false)
      expect(((saved.pricingRules as Doc[]) ?? []).map((r) => r.name)).toEqual([`Bulk ${tag}`])
      expect((saved.pricingRules as Doc[])[0]).toMatchObject({ appliesWhen: 'quantity', minQuantity: 10, exclusive: true, showOnProduct: true })
    } finally {
      await e().updateGlobal({ slug: 'shop-extra-settings', data: original, overrideAccess: true }).catch((): void => undefined)
    }
  })
})
