import { kindForStatus, sendOrderEmail } from './emails'
import { restockOrder } from './orders'

type Args = { doc: Record<string, unknown>; previousDoc?: Record<string, unknown>; operation: 'create' | 'update'; req: { engine: never; user?: { id?: number; email?: string } | null }; context?: Record<string, unknown> }

/**
 * After an admin changes an order's status: log it in the notes and email the customer.
 * Orders paid through checkout set their status with an atomic SQL update (see
 * orders.ts markOrderPaid), which sends its own emails, so this only fires for
 * edits made through the engine.
 */
export async function runOrderAfterChange({ doc, previousDoc, operation, req, context }: Args) {
  if (operation !== 'update' || !previousDoc || context?.skipOrderHooks) return doc
  const from = previousDoc.status as string | undefined
  const to = doc.status as string | undefined
  if (!to || from === to) return doc
  const engine = req.engine as unknown as Parameters<typeof sendOrderEmail>[0] & Parameters<typeof restockOrder>[0]
  try {
    if (to === 'cancelled' && from !== 'pending' && from !== 'failed') await restockOrder(engine, doc, 'Order cancelled')
    const kind = kindForStatus(to)
    if (kind) await sendOrderEmail(engine, doc, kind)
  } catch {
    /* hooks must not fail a status save */
  }
  return doc
}
