import type { CollectionAfterChangeHook } from '@/engine'

import { emitWebhookEvent } from './emit'
import type { WebhookEvent } from './events'

/**
 * Collection hooks that turn saves into webhook events. Each one only queues an event (see ./emit.ts),
 * so a slow or failing receiver never delays or fails the save. Hooks return the doc unchanged.
 */

type Doc = Record<string, unknown>

const contentEvent = (operation: string, doc: Doc, previous: Doc | null): WebhookEvent => {
  if (operation === 'create') return 'content.created'
  const was = previous?._status
  const now = doc._status
  if (now === 'published' && was !== 'published') return 'content.published'
  if (now !== 'published' && was === 'published') return 'content.unpublished'
  return 'content.updated'
}

/** Pages, posts, products and events: created, updated, published and unpublished. */
export const webhookContentAfterChange =
  (collection: 'pages' | 'posts' | 'products' | 'events'): CollectionAfterChangeHook =>
  async (args) => {
    try {
      const { doc, previousDoc, operation } = args as unknown as { doc: Doc | null; previousDoc: Doc | null; operation: string }
      if (!doc) return doc
      const event = contentEvent(operation, doc, previousDoc)
      void emitWebhookEvent(event, { ...doc, collection, status: doc._status ?? doc.status })
    } catch {
      // Events are best effort.
    }
    return args.doc
  }

/** Orders: a new order is `order.created`. The paid event is sent from markOrderPaid (checkout writes that row directly). */
export const webhookOrderAfterChange: CollectionAfterChangeHook = async (args) => {
  try {
    const { doc, operation } = args as unknown as { doc: Doc | null; operation: string }
    if (doc && operation === 'create') void emitWebhookEvent('order.created', { ...doc })
  } catch {
    // Events are best effort.
  }
  return args.doc
}

/** Refunds: `order.refunded` on each new refund. */
export const webhookRefundAfterChange: CollectionAfterChangeHook = async (args) => {
  try {
    const { doc, operation } = args as unknown as { doc: Doc | null; operation: string }
    if (doc && operation === 'create') {
      const order = doc.order
      const orderId = order && typeof order === 'object' ? (order as { id?: unknown }).id : order
      void emitWebhookEvent('order.refunded', { ...doc, orderId })
    }
  } catch {
    // Events are best effort.
  }
  return args.doc
}

/** Tracking events: `tracking-event.saved` on each create or update. */
export const webhookTrackingEventAfterChange: CollectionAfterChangeHook = async (args) => {
  try {
    const { doc, operation } = args as unknown as { doc: Doc | null; operation: string }
    if (doc && (operation === 'create' || operation === 'update')) void emitWebhookEvent('tracking-event.saved', { ...doc })
  } catch {
    // Events are best effort.
  }
  return args.doc
}

/** New customer or admin accounts: `user.registered`. */
export const webhookUserAfterChange: CollectionAfterChangeHook = async (args) => {
  try {
    const { doc, operation } = args as unknown as { doc: Doc | null; operation: string }
    if (doc && operation === 'create') void emitWebhookEvent('user.registered', { ...doc })
  } catch {
    // Events are best effort.
  }
  return args.doc
}
