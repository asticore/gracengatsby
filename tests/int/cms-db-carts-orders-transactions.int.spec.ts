// @vitest-environment node
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createCart, deleteCart, findCartByID, updateCart, createOrder, deleteOrder, findOrderByID, updateOrder, createTransaction, deleteTransaction, findTransactionByID, updateTransaction } from '@/cms/db'

describe('cms/db - carts, orders, transactions (Stage 10 Ecommerce, Layer 1)', () => {
  let engine: Engine
  const createdCartIds: number[] = []
  const createdOrderIds: number[] = []
  const createdTransactionIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

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
    it('reads a cart written by Payload', async () => {
      const created = await engine.create({
        collection: 'carts',
        data: {
          secret: 'test-secret',
          currency: 'AUD',
        },
      })
      createdCartIds.push(created.id as number)

      const viaOurs = await findCartByID(created.id as number)
      expect(viaOurs?.secret).toBe('test-secret')
      expect(viaOurs?.currency).toBe('AUD')
    })

    it('writes a cart Payload can read back', async () => {
      const ours = await createCart({
        currency: 'USD',
      })
      createdCartIds.push(ours.id)

      const viaPayload = await engine.findByID({ collection: 'carts', id: ours.id })
      expect(viaPayload.currency).toBe('USD')
    })
  })

  describe('Orders', () => {
    it('reads an order written by Payload', async () => {
      const created = await engine.create({
        collection: 'orders',
        data: {
          customerEmail: 'test@example.com',
          status: 'processing',
          amount: 100,
          currency: 'AUD',
        },
      })
      createdOrderIds.push(created.id as number)

      const viaOurs = await findOrderByID(created.id as number)
      expect(viaOurs?.customerEmail).toBe('test@example.com')
      expect(viaOurs?.status).toBe('processing')
      expect(viaOurs?.amount).toBe(100)
    })

    it('writes an order Payload can read back', async () => {
      const ours = await createOrder({
        customerEmail: 'order@example.com',
        status: 'completed',
        amount: 250,
      })
      createdOrderIds.push(ours.id)

      const viaPayload = await engine.findByID({ collection: 'orders', id: ours.id })
      expect(viaPayload.customerEmail).toBe('order@example.com')
      expect(viaPayload.status).toBe('completed')
    })
  })

  describe('Transactions', () => {
    it('reads a transaction written by Payload', async () => {
      const created = await engine.create({
        collection: 'transactions',
        data: {
          status: 'pending',
          customerEmail: 'trans@example.com',
          amount: 500,
          currency: 'AUD',
        },
      })
      createdTransactionIds.push(created.id as number)

      const viaOurs = await findTransactionByID(created.id as number)
      expect(viaOurs?.status).toBe('pending')
      expect(viaOurs?.customerEmail).toBe('trans@example.com')
    })

    it('writes a transaction Payload can read back', async () => {
      const ours = await createTransaction({
        status: 'succeeded',
        customerEmail: 'payment@example.com',
        amount: 750,
      })
      createdTransactionIds.push(ours.id)

      const viaPayload = await engine.findByID({ collection: 'transactions', id: ours.id })
      expect(viaPayload.status).toBe('succeeded')
      expect(viaPayload.customerEmail).toBe('payment@example.com')
      expect(viaPayload.amount).toBe(750)
    })
  })
})
