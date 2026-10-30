import { after } from '@/features/webhooks/after'
import type { D1Like } from '@/features/apiKeys'
import { attemptDelivery, queueEvent, type DeliveryDeps } from './delivery'
import type { WebhookEvent } from './events'
import { createD1WebhookStore, type WebhookStore } from './store'

/**
 * Event entry points. The collection hooks and the form and order code call `emitWebhookEvent`:
 * it queues the rows and sends them after the response, and it never throws or delays the save.
 * `dispatchEvent` is the same work with the store passed in, for the tests.
 */

/** Queues the event for every subscribed webhook, then sends each row now. Never rejects. */
export async function dispatchEvent(deps: DeliveryDeps, event: WebhookEvent, data: Record<string, unknown>): Promise<number[]> {
  try {
    const ids = await queueEvent(deps, event, data)
    for (const id of ids) await attemptDelivery(deps, id)
    return ids
  } catch {
    return []
  }
}

/**
 * Emails the shop admin address (Shop settings > Emails), the same address order alerts use. With no
 * address set, nothing is sent: the webhook is still switched off and the log says why.
 */
export async function notifyWebhookAdmins(subject: string, text: string): Promise<void> {
  try {
    const { getEngine } = await import('@/engine')
    const { sendEmail } = await import('@/features/email')
    const engine = await getEngine()
    const settings = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as { emails?: { adminEmail?: unknown } }
    const to = typeof settings.emails?.adminEmail === 'string' ? settings.emails.adminEmail : ''
    if (!to) return
    await sendEmail({ to, subject, text, template: 'webhook.disabled' })
  } catch {
    // Notification only.
  }
}

export async function emitWebhookEvent(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const { resolveD1Binding } = await import('@/cms/db/connect')
    const store: WebhookStore = createD1WebhookStore(async () => (await resolveD1Binding()) as unknown as D1Like)
    after(dispatchEvent({ store, notifyAdmins: notifyWebhookAdmins }, event, data).catch((): number[] => []))
  } catch {
    // An event that cannot be queued never fails the save that caused it.
  }
}

export type { WebhookStore }
