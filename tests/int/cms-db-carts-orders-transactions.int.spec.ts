// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'

import { createCart, deleteCart, findCartByID, createOrder, deleteOrder, findOrderByID, createTransaction, deleteTransaction, findTransactionByID } from '@/cms/db'

// Stage 10 Ecommerce, Layer 1. This used to be a "write-both-ways" proof
// against a live real-Payload engine (create via engine.create, read via
// our own find*ByID, and vice versa) to prove our own D1/Drizzle
// reader/writer stays byte-compatible with what real Payload's own
// collection config would produce for the same tables. shopPlugin() is now
// REMOVED (payload-removal-plan.md: ecommerce cutover) and
// 'carts'/'orders'/'transactions' are no longer real Payload collections at
// all - engine.create({collection: 'carts', ...}) would now throw
// APIError: "The collection with slug carts can't be found." There is no
// real Payload behavior left to compare against, so these are now plain
// self-consistency tests of our own create*/find*ByID/update*/delete*
// implementations instead.
describe('cms/db - carts, orders, transactions (Stage 10 Ecommerce, Layer 1)', () => {
  beforeAll(async () => {
    await ensureMigratedLocalDb()
  }, 300_000)

  const createdCartIds: number[] = []
  const createdOrderIds: number[] = []
  const createdTransactionIds: number[] = []

  afterAll(async () => {
    for (const id of createdCartIds) {
      await deleteCart(id)
    }
    for (const id of createdOrderIds) {
      await deleteOrder(id)
    }
    for (const id of createdTransactionIds) {
      await deleteTransaction(id)
    }
  })

  describe('Carts', () => {
    it('creates a cart and reads it back', async () => {
      const ours = await createCart({
        secret: 'test-secret',
        currency: 'AUD',
      })
      createdCartIds.push(ours.id)

      const viaOurs = await findCartByID(ours.id)
      expect(viaOurs?.secret).toBe('test-secret')
      expect(viaOurs?.currency).toBe('AUD')
    })

    it('creates another cart and reads it back', async () => {
      const ours = await createCart({
        currency: 'USD',
      })
      createdCartIds.push(ours.id)

      const viaOurs = await findCartByID(ours.id)
      expect(viaOurs?.currency).toBe('USD')
    })
  })

  describe('Orders', () => {
    it('creates an order and reads it back', async () => {
      const ours = await createOrder({
        customerEmail: 'test@example.com',
        status: 'processing',
        amount: 100,
        currency: 'AUD',
      })
      createdOrderIds.push(ours.id)

      const viaOurs = await findOrderByID(ours.id)
      expect(viaOurs?.customerEmail).toBe('test@example.com')
      expect(viaOurs?.status).toBe('processing')
      expect(viaOurs?.amount).toBe(100)
    })

    it('creates another order and reads it back', async () => {
      const ours = await createOrder({
        customerEmail: 'order@example.com',
        status: 'completed',
        amount: 250,
      })
      createdOrderIds.push(ours.id)

      const viaOurs = await findOrderByID(ours.id)
      expect(viaOurs?.customerEmail).toBe('order@example.com')
      expect(viaOurs?.status).toBe('completed')
    })
  })

  describe('Transactions', () => {
    it('creates a transaction and reads it back', async () => {
      const ours = await createTransaction({
        status: 'pending',
        customerEmail: 'trans@example.com',
        amount: 500,
        currency: 'AUD',
      })
      createdTransactionIds.push(ours.id)

      const viaOurs = await findTransactionByID(ours.id)
      expect(viaOurs?.status).toBe('pending')
      expect(viaOurs?.customerEmail).toBe('trans@example.com')
    })

    it('creates another transaction and reads it back', async () => {
      const ours = await createTransaction({
        status: 'succeeded',
        customerEmail: 'payment@example.com',
        amount: 750,
      })
      createdTransactionIds.push(ours.id)

      const viaOurs = await findTransactionByID(ours.id)
      expect(viaOurs?.status).toBe('succeeded')
      expect(viaOurs?.customerEmail).toBe('payment@example.com')
      expect(viaOurs?.amount).toBe(750)
    })
  })
})
