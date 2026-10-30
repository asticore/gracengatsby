// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createWebhookRecord, deleteWebhookRecord, setWebhookEnabledRecord, updateWebhookRecord } from '@/features/webhooks/admin'
import { REQUEST_TIMEOUT_MS, verifySignature, type WebhookConfig } from '@/features/webhooks/core'
import { alertIfFailing, attemptDelivery, processDue, queueEvent, replayDelivery, sendTest, TEST_DATA, type DeliveryDeps } from '@/features/webhooks/delivery'
import { dispatchEvent } from '@/features/webhooks/emit'
import { sealSecret } from '@/features/webhooks/secret'
import type { DeliveryPatch, DeliveryRecord, NewDelivery, WebhookRecord, WebhookStore } from '@/features/webhooks/store'

/** An in-memory WebhookStore with the same rules as the D1 one (filters, ordering, the due query). */
function memoryStore() {
  const hooks = new Map<number, WebhookRecord>()
  const rows = new Map<number, DeliveryRecord>()
  let hookSeq = 0
  let rowSeq = 0
  const store: WebhookStore = {
    list: async () => [...hooks.values()],
    findById: async (id) => hooks.get(id) ?? null,
    activeFor: async (event) => [...hooks.values()].filter((h) => h.enabled && h.events.includes(event)),
    count: async () => hooks.size,
    insert: async (config, secret, at) => {
      const id = ++hookSeq
      hooks.set(id, { ...config, id, secret, createdAt: at, updatedAt: at })
      return id
    },
    update: async (id, config, at) => {
      const old = hooks.get(id)!
      hooks.set(id, { ...config, id, secret: old.secret, createdAt: old.createdAt, updatedAt: at })
    },
    setSecret: async (id, secret, at) => {
      const old = hooks.get(id)!
      hooks.set(id, { ...old, secret, updatedAt: at })
    },
    remove: async (id) => {
      hooks.delete(id)
      for (const [rid, r] of rows) if (r.webhookId === id) rows.delete(rid)
    },
    insertDelivery: async (row: NewDelivery, at) => {
      const id = ++rowSeq
      rows.set(id, { ...row, id, createdAt: at, updatedAt: at })
      return id
    },
    updateDelivery: async (id, patch: DeliveryPatch, at) => {
      const old = rows.get(id)
      if (old) rows.set(id, { ...old, ...patch, updatedAt: at })
    },
    findDelivery: async (id) => rows.get(id) ?? null,
    listDeliveries: async (webhookId, limit) => [...rows.values()].filter((r) => r.webhookId === webhookId).sort((a, b) => b.id - a.id).slice(0, limit),
    lastDelivery: async (webhookId) => [...rows.values()].filter((r) => r.webhookId === webhookId).sort((a, b) => b.id - a.id)[0] ?? null,
    due: async (nowIso, limit) =>
      [...rows.values()].filter((r) => r.status === 'pending' && r.nextAttemptAt !== null && r.nextAttemptAt <= nowIso).sort((a, b) => String(a.nextAttemptAt).localeCompare(String(b.nextAttemptAt))).slice(0, limit),
    queuedSince: async (webhookId, sinceIso) => [...rows.values()].filter((r) => r.webhookId === webhookId && r.status !== 'skipped' && r.createdAt >= sinceIso).length,
    setEnabled: async (id, enabled, at) => {
      const old = hooks.get(id)!
      hooks.set(id, { ...old, enabled, updatedAt: at })
    },
    recentOutcomes: async (webhookId, limit) =>
      [...rows.values()]
        .filter((r) => r.webhookId === webhookId && (r.status === 'ok' || r.status === 'failed'))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((r) => r.status),
    pruneDeliveries: async (beforeIso) => {
      for (const [rid, r] of rows) if (r.createdAt < beforeIso) rows.delete(rid)
    },
  }
  return { store, hooks, rows }
}

const SECRET = 'whsec_unit_test_secret'
const CONFIG: WebhookConfig = { name: 'Orders', description: '', url: 'https://hooks.example.com/in', events: ['order.paid', 'content.published'], template: null, enabled: true, ratePerMinute: 60 }

function fixture(now = Date.UTC(2026, 9, 30, 12, 0, 0), fetcher: typeof fetch = async () => new Response('ok', { status: 200 })) {
  const { store, hooks, rows } = memoryStore()
  let clock = now
  let seq = 0
  const deps: DeliveryDeps = { store, fetcher, now: () => clock, newId: () => `dlv_test_${++seq}` }
  return { deps, store, hooks, rows, setClock: (t: number) => (clock = t), advance: (ms: number) => (clock += ms) }
}

async function addHook(deps: DeliveryDeps, store: WebhookStore, config: Partial<WebhookConfig> = {}) {
  const at = new Date().toISOString()
  const created = await createWebhookRecord(store, { ...CONFIG, ...config }, sealSecret(SECRET), at)
  if (created.ok === false) throw new Error(created.error)
  return created.value
}

describe('webhook delivery', () => {
  beforeAll(() => {
    process.env.ENGAGE_SECRET = 'engage-secret-for-webhook-tests'
  })
  afterAll(() => {
    delete process.env.ENGAGE_SECRET
  })

  it('sends a signed POST that the receiver can verify, with the stable delivery id and no redirects', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init as RequestInit })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const f = fixture(undefined, fetcher)
    const hook = await addHook(f.deps, f.store)
    const ids = await dispatchEvent(f.deps, 'order.paid', { id: 9, status: 'processing', amount: 1250, customerEmail: 'buyer@example.com', secret: 'never' })
    expect(ids).toHaveLength(1)
    const row = await f.store.findDelivery(ids[0])
    expect(row?.status).toBe('ok')
    expect(row?.attempts).toBe(1)
    expect(row?.lastStatusCode).toBe(204)
    const call = calls[0]
    expect(call.url).toBe('https://hooks.example.com/in')
    expect(call.init.method).toBe('POST')
    expect(call.init.redirect).toBe('manual')
    const headers = call.init.headers as Record<string, string>
    expect(headers['X-Engage-Event']).toBe('order.paid')
    expect(headers['X-Engage-Delivery']).toBe(row?.deliveryId)
    expect(await verifySignature(SECRET, headers['X-Engage-Signature'], String(call.init.body), Math.floor(Date.now() / 1000), 60 * 60 * 24 * 365 * 10)).toBe(true)
    const body = JSON.parse(String(call.init.body))
    expect(body).toMatchObject({ event: 'order.paid', id: row?.deliveryId, data: { id: 9, amount: 1250, customerEmail: 'buyer@example.com' } })
    expect(body.data.secret).toBeUndefined()
    expect(hook.id).toBeGreaterThan(0)
  })

  it('does not queue an event the webhook does not subscribe to, or for a webhook that is off', async () => {
    const f = fixture()
    const hook = await addHook(f.deps, f.store, { events: ['form.submitted'] })
    expect(await queueEvent(f.deps, 'order.paid', {})).toEqual([])
    const off = await addHook(f.deps, f.store, { events: ['order.paid'], enabled: false })
    expect(await queueEvent(f.deps, 'order.paid', {})).toEqual([])
    expect(hook.id).not.toBe(off.id)
  })

  it('backs off after a failure, retries when due, and gives up after the last attempt', async () => {
    const start = Date.UTC(2026, 9, 30, 12, 0, 0)
    const failing = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const f = fixture(start, failing)
    await addHook(f.deps, f.store)
    const [id] = await dispatchEvent(f.deps, 'order.paid', { id: 1 })
    let row = await f.store.findDelivery(id)
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastStatusCode: 500 })
    expect(row?.lastError).toBe('The receiver answered 500.')
    expect(row?.nextAttemptAt).toBe(new Date(start + 60_000).toISOString())

    f.setClock(start + 60_000)
    await processDue(f.deps)
    row = await f.store.findDelivery(id)
    expect(row).toMatchObject({ status: 'pending', attempts: 2 })

    for (let i = 0; i < 4; i += 1) {
      f.advance(24 * 60 * 60 * 1000)
      await processDue(f.deps)
    }
    row = await f.store.findDelivery(id)
    expect(row).toMatchObject({ status: 'failed', attempts: 6, nextAttemptAt: null })
    expect(failing).toHaveBeenCalledTimes(6)
  })

  it('switches a webhook off after five failed deliveries in a row and tells the admins', async () => {
    const start = Date.UTC(2026, 9, 30, 12, 0, 0)
    const failing = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const notifyAdmins = vi.fn(async (_subject: string, _text: string) => undefined)
    const f = fixture(start, failing)
    const hook = await addHook(f.deps, f.store)
    const deps = { ...f.deps, notifyAdmins }
    for (let i = 0; i < 5; i += 1) await dispatchEvent(deps, 'order.paid', { id: i })
    for (let day = 0; day < 6; day += 1) {
      f.advance(24 * 60 * 60 * 1000)
      await processDue(deps)
    }
    expect(f.hooks.get(hook.id)?.enabled).toBe(false)
    expect(notifyAdmins).toHaveBeenCalled()
    expect(String(notifyAdmins.mock.calls[0][0])).toContain('Orders')
  })

  it('a webhook with fewer than five failures, or with a success in the streak, stays on', async () => {
    const f = fixture()
    const hook = await addHook(f.deps, f.store)
    await f.store.insertDelivery({ webhookId: hook.id, deliveryId: 'a', event: 'order.paid', body: '{}', status: 'failed', attempts: 6, nextAttemptAt: null, lastStatusCode: 500, lastError: 'x' }, new Date().toISOString())
    await f.store.insertDelivery({ webhookId: hook.id, deliveryId: 'b', event: 'order.paid', body: '{}', status: 'ok', attempts: 1, nextAttemptAt: null, lastStatusCode: 200, lastError: null }, new Date().toISOString())
    await alertIfFailing(f.deps, hook, new Date().toISOString())
    expect(f.hooks.get(hook.id)?.enabled).toBe(true)
  })

  it('treats a redirect as a failure and does not follow it', async () => {
    const redirecting = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example.com/' } })) as unknown as typeof fetch
    const f = fixture(undefined, redirecting)
    await addHook(f.deps, f.store)
    const [id] = await dispatchEvent(f.deps, 'order.paid', {})
    const row = await f.store.findDelivery(id)
    expect(row?.status).toBe('pending')
    expect(row?.lastError).toMatch(/Redirects are not followed/)
    expect((redirecting as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('records a timeout and a connection failure in plain words', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const f = fixture(undefined, (async () => {
      throw aborted
    }) as unknown as typeof fetch)
    await addHook(f.deps, f.store)
    const [id] = await dispatchEvent(f.deps, 'order.paid', {})
    expect((await f.store.findDelivery(id))?.lastError).toBe('Timed out.')
    expect(REQUEST_TIMEOUT_MS).toBe(8000)

    const g = fixture(undefined, (async () => {
      throw new Error('socket hang up')
    }) as unknown as typeof fetch)
    await addHook(g.deps, g.store)
    const [gid] = await dispatchEvent(g.deps, 'order.paid', {})
    expect((await g.store.findDelivery(gid))?.lastError).toBe('Could not connect.')
  })

  it('skips deliveries over the per-minute rate, and writes the reason to the log', async () => {
    const f = fixture()
    await addHook(f.deps, f.store, { ratePerMinute: 1 })
    await dispatchEvent(f.deps, 'order.paid', { id: 1 })
    const second = await dispatchEvent(f.deps, 'order.paid', { id: 2 })
    const row = await f.store.findDelivery(second[0])
    expect(row?.status).toBe('skipped')
    expect(row?.lastError).toMatch(/Rate limit reached: 1 deliveries a minute/)
  })

  it('a template that cannot be filled is logged as skipped and never sent', async () => {
    const f = fixture()
    await addHook(f.deps, f.store, { template: '{"blob": "{{data.customerEmail}}"}' })
    const [id] = await queueEvent(f.deps, 'order.paid', { customerEmail: 'x'.repeat(70_000) })
    const row = await f.store.findDelivery(id)
    expect(row?.status).toBe('skipped')
    expect(row?.lastError).toMatch(/larger than the limit/)
  })

  it('refuses to send when the stored secret cannot be read, and does not retry it', async () => {
    const f = fixture()
    const hook = await addHook(f.deps, f.store)
    await f.store.setSecret(hook.id, 'enc:v1:00:00:00', new Date().toISOString())
    const [id] = await dispatchEvent(f.deps, 'order.paid', {})
    const row = await f.store.findDelivery(id)
    expect(row?.status).toBe('failed')
    expect(row?.lastError).toMatch(/Rotate the secret/)
  })

  it('refuses a stored address that no longer passes the address rules', async () => {
    const f = fixture()
    const hook = await addHook(f.deps, f.store)
    await f.store.update(hook.id, { ...CONFIG, url: 'https://10.0.0.8/in' }, new Date().toISOString())
    const rowId = await f.store.insertDelivery({ webhookId: hook.id, deliveryId: 'dlv_x', event: 'order.paid', body: '{}', status: 'pending', attempts: 0, nextAttemptAt: null, lastStatusCode: null, lastError: null }, new Date().toISOString())
    const outcome = await attemptDelivery(f.deps, rowId)
    expect(outcome.status).toBe('failed')
    expect(outcome.error).toMatch(/private or internal/)
  })

  it('the Test button sends a sample now and ignores the rate limit', async () => {
    const seen: string[] = []
    const f = fixture(undefined, (async (_url: unknown, init?: RequestInit) => {
      seen.push(String(init?.body))
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch)
    const hook = await addHook(f.deps, f.store, { ratePerMinute: 1, template: '{"title": "{{data.title}}"}' })
    await dispatchEvent(f.deps, 'order.paid', {})
    const outcome = await sendTest(f.deps, hook.id)
    expect(outcome).toMatchObject({ status: 'ok', statusCode: 200, error: null })
    expect(JSON.parse(seen[seen.length - 1])).toEqual({ title: TEST_DATA.title })
  })

  it('replays a logged delivery with the same body and delivery id, under a new signature', async () => {
    const bodies: string[] = []
    const headers: Array<Record<string, string>> = []
    const f = fixture(undefined, (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body))
      headers.push(init?.headers as Record<string, string>)
      return new Response(null, { status: bodies.length === 1 ? 500 : 200 })
    }) as unknown as typeof fetch)
    await addHook(f.deps, f.store)
    const [first] = await dispatchEvent(f.deps, 'order.paid', { id: 3 })
    const original = await f.store.findDelivery(first)
    f.advance(1000)
    const outcome = await replayDelivery(f.deps, first)
    expect(outcome.status).toBe('ok')
    expect(bodies[1]).toBe(bodies[0])
    expect(headers[1]['X-Engage-Delivery']).toBe(original?.deliveryId)
    expect(headers[1]['X-Engage-Signature']).not.toBe(headers[0]['X-Engage-Signature'])
  })

  it('will not replay a delivery that never had a body', async () => {
    const f = fixture()
    await addHook(f.deps, f.store)
    const rowId = await f.store.insertDelivery({ webhookId: 1, deliveryId: 'dlv_empty', event: 'order.paid', body: '', status: 'skipped', attempts: 0, nextAttemptAt: null, lastStatusCode: null, lastError: 'x' }, new Date().toISOString())
    expect((await replayDelivery(f.deps, rowId)).status).toBe('failed')
  })

  it('keeps the same events a webhook was saved with when the settings are edited, and turns off cleanly', async () => {
    const f = fixture()
    const hook = await addHook(f.deps, f.store)
    const updated = await updateWebhookRecord(f.store, hook.id, { ...CONFIG, events: ['content.published'] }, new Date().toISOString())
    expect(updated.ok && updated.value.events).toEqual(['content.published'])
    const off = await setWebhookEnabledRecord(f.store, hook.id, false, new Date().toISOString())
    expect(off.ok && off.value.enabled).toBe(false)
    expect(await queueEvent(f.deps, 'content.published', {})).toEqual([])
    const gone = await deleteWebhookRecord(f.store, hook.id)
    expect(gone.ok).toBe(true)
    expect(await f.store.findById(hook.id)).toBeNull()
  })

  it('an unreadable webhook id in the Test button is a plain failure, not an exception', async () => {
    const f = fixture()
    const outcome = await sendTest(f.deps, 999)
    expect(outcome.status).toBe('failed')
  })
})
