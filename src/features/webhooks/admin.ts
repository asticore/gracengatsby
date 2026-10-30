import { MAX_WEBHOOKS, validateWebhook, type ValidationResult, type WebhookConfig } from './core'
import type { WebhookRecord, WebhookStore } from './store'

/**
 * The webhook write rules, shared by the server actions and the tests. Everything goes through a
 * `WebhookStore`, so this file has no database or session of its own. The caller checks the
 * `webhooks` permission first, and passes an already-encrypted secret on create.
 */

/** Creates a webhook. Refuses past MAX_WEBHOOKS. */
export async function createWebhookRecord(store: WebhookStore, input: unknown, sealedSecret: string, at: string): Promise<ValidationResult<WebhookRecord>> {
  if ((await store.count()) >= MAX_WEBHOOKS) return { ok: false, error: `A site can have at most ${MAX_WEBHOOKS} webhooks.` }
  const checked = validateWebhook(input)
  if (checked.ok === false) return checked
  const id = await store.insert(checked.value, sealedSecret, at)
  const saved = await store.findById(id)
  return saved ? { ok: true, value: saved } : { ok: false, error: 'The webhook could not be saved.' }
}

/** Updates a webhook's settings. The signing secret is kept as it is. */
export async function updateWebhookRecord(store: WebhookStore, id: number, input: unknown, at: string): Promise<ValidationResult<WebhookRecord>> {
  if (!(await store.findById(id))) return { ok: false, error: 'That webhook no longer exists.' }
  const checked = validateWebhook(input)
  if (checked.ok === false) return checked
  await store.update(id, checked.value, at)
  const saved = await store.findById(id)
  return saved ? { ok: true, value: saved } : { ok: false, error: 'The webhook could not be saved.' }
}

/** Turns a webhook on or off without touching anything else. */
export async function setWebhookEnabledRecord(store: WebhookStore, id: number, enabled: boolean, at: string): Promise<ValidationResult<WebhookRecord>> {
  const existing = await store.findById(id)
  if (!existing) return { ok: false, error: 'That webhook no longer exists.' }
  const config: WebhookConfig = {
    name: existing.name,
    description: existing.description,
    url: existing.url,
    events: existing.events,
    template: existing.template,
    enabled,
    ratePerMinute: existing.ratePerMinute,
  }
  await store.update(id, config, at)
  const saved = await store.findById(id)
  return saved ? { ok: true, value: saved } : { ok: false, error: 'The webhook could not be saved.' }
}

/** Deletes a webhook and its delivery log. */
export async function deleteWebhookRecord(store: WebhookStore, id: number): Promise<ValidationResult<true>> {
  if (!(await store.findById(id))) return { ok: false, error: 'That webhook no longer exists.' }
  await store.remove(id)
  return { ok: true, value: true }
}
