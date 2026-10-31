// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import {
  anonymisedOrderPatch,
  buildExportDocument,
  dueDateFor,
  isOverdue,
  nextStatus,
  sessionIsFresh,
  stripSecrets,
  valuesMentionEmail,
} from '@/features/privacy/core'
import { exportCustomerData } from '@/features/privacy/export'
import { hashVerifyToken, newVerifyToken } from '@/features/privacy/tokens'
import { eraseCustomerData } from '@/features/privacy/erase'
import { createD1PrivacyStore } from '@/features/privacy/store'
import { UI_STRING_SOURCE } from '@/features/uiStrings/keys'
import { DICTIONARY_LOADERS } from '@/features/uiStrings/loaders'
import { confirmDeletionByToken, decideRequest, executeErasure, openDeletionRequest } from '@/features/privacy/service'

// The email feature loads the whole engine; the tests only need to see that a mail was attempted.
vi.mock('@/features/email', () => ({ sendEmail: async () => ({ ok: true }) }))

type Call = { sql: string; args: unknown[] }

/** Records every D1 statement and answers the form-entry query from `submissions`. */
function fakeD1(submissions: { id: number; form_id: number; values: string; submitted_at: string }[] = []) {
  const calls: Call[] = []
  const d1 = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args })
          return {
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => ({ results: (sql.includes('eg_form_submissions') ? submissions : []) as unknown[] }),
            first: async (): Promise<null> => null,
          }
        },
      }
    },
  }
  return { d1, calls }
}

/** An engine stand-in: `find` answers from fixtures by collection, and every write is recorded. */
function fakeEngine(fixtures: Record<string, Record<string, unknown>[]>) {
  const writes: { op: 'update' | 'delete'; collection: string; id?: unknown; data?: Record<string, unknown> }[] = []
  const engine = {
    async find({ collection }: { collection: string }) {
      return { docs: fixtures[collection] ?? [] }
    },
    async update({ collection, id, data }: { collection: string; id: unknown; data: Record<string, unknown> }) {
      writes.push({ op: 'update', collection, id, data })
      return {}
    },
    async delete({ collection, id }: { collection: string; id: unknown }) {
      writes.push({ op: 'delete', collection, id })
      return {}
    },
  }
  return { engine, writes }
}

const SECRET_FIELDS = ['passwordHash', 'salt', 'twoFactorSecret', 'twoFactorBackupHashes', 'emailVerifyTokenHash', 'sessionToken', 'token_hash', 'apiKeyHash', 'key_hash']

const user = {
  id: 7,
  email: 'ana@example.com',
  emailVerifiedAt: '2026-10-01T00:00:00.000Z',
  displayName: 'Ana',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
  passwordHash: 'pbkdf2$secret-hash',
  salt: 'salty',
  twoFactorSecret: 'JBSWY3DPEHPK3PXP',
  twoFactorBackupHashes: '["abc123"]',
  emailVerifyTokenHash: 'deadbeef',
  roles: ['customer'],
}

const order = {
  id: 91,
  orderNumber: 'A-1001',
  status: 'paid',
  amount: 12345,
  taxTotal: 1122,
  currency: 'AUD',
  customer: 7,
  customerEmail: 'ana@example.com',
  customerNote: 'Leave at the gate',
  checkoutFields: { giftMessage: 'Happy birthday' },
  notes: [{ text: 'Called about the parcel' }],
  shippingAddress: { firstName: 'Ana', lastName: 'Silva', addressLine1: '1 Test Street', city: 'Sydney', postalCode: '2000', country: 'AU' },
  lineItems: [{ name: 'Candle', qty: 2, price: 500 }],
  createdAt: '2026-03-01T00:00:00.000Z',
}

describe('privacy request rules', () => {
  it('sets the deadline 30 days after the request and reports overdue only while open', () => {
    expect(dueDateFor('2026-10-01T00:00:00.000Z')).toBe('2026-10-31T00:00:00.000Z')
    const now = Date.parse('2026-11-05T00:00:00.000Z')
    expect(isOverdue({ status: 'new', dueAt: '2026-10-31T00:00:00.000Z' }, now)).toBe(true)
    expect(isOverdue({ status: 'done', dueAt: '2026-10-31T00:00:00.000Z' }, now)).toBe(false)
    expect(isOverdue({ status: 'rejected', dueAt: '2026-10-31T00:00:00.000Z' }, now)).toBe(false)
  })

  it('moves a request only along the allowed steps', () => {
    expect(nextStatus('unverified', 'verify')).toBe('new')
    expect(nextStatus('unverified', 'approve')).toBeNull()
    expect(nextStatus('new', 'approve')).toBe('in_progress')
    expect(nextStatus('new', 'erase')).toBeNull()
    expect(nextStatus('in_progress', 'erase')).toBe('done')
    expect(nextStatus('done', 'reject')).toBeNull()
    expect(nextStatus('in_progress', 'reject')).toBe('rejected')
  })

  it('stores only the hash of the emailed token and accepts the matching token', () => {
    const { token, hash } = newVerifyToken()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(hash).not.toContain(token)
    expect(hashVerifyToken(token)).toBe(hash)
  })

  it('treats a session as fresh for 15 minutes only', () => {
    const now = Date.parse('2026-10-31T12:00:00.000Z')
    expect(sessionIsFresh('2026-10-31T11:50:00.000Z', now)).toBe(true)
    expect(sessionIsFresh('2026-10-31T11:30:00.000Z', now)).toBe(false)
    expect(sessionIsFresh(null, now)).toBe(false)
  })

  it('matches an email in form values exactly, ignoring case and spaces', () => {
    expect(valuesMentionEmail({ email: ' ANA@example.com ' }, 'ana@example.com')).toBe(true)
    expect(valuesMentionEmail({ email: 'ana@example.com.au' }, 'ana@example.com')).toBe(false)
    expect(valuesMentionEmail({ nested: ['x', { deeper: 'ana@example.com' }] }, 'ana@example.com')).toBe(true)
  })
})

describe('data export', () => {
  it('never contains a password hash, a salt, a two-step secret, a backup code or a token', () => {
    const doc = buildExportDocument({
      user,
      addresses: [{ id: 3, city: 'Sydney', customer: 7, tokenHash: 'x' }],
      orders: [order],
      bookings: [{ id: 5, email: 'ana@example.com', name: 'Ana', guestCount: 2, password: 'nope' }],
      submissions: [{ form: '4', submittedAt: '2026-04-01', values: { email: 'ana@example.com', message: 'Hi', apiKey: 'sk_live_123' } }],
      requestedAt: '2026-10-31T00:00:00.000Z',
    })
    const text = JSON.stringify(doc)
    for (const secret of ['pbkdf2$secret-hash', 'salty', 'JBSWY3DPEHPK3PXP', 'abc123', 'deadbeef', 'sk_live_123', 'nope', 'tokenHash']) {
      expect(text, secret).not.toContain(secret)
    }
    for (const field of SECRET_FIELDS) expect(text, field).not.toContain(`"${field}"`)
    expect(text).not.toContain('"roles"')
  })

  it('keeps the customer own order details and says what is not included', () => {
    const doc = buildExportDocument({ user, addresses: [], orders: [order], bookings: [], submissions: [], requestedAt: '2026-10-31T00:00:00.000Z' }) as {
      orders: Record<string, unknown>[]
      account: Record<string, unknown>
      notIncluded: string[]
    }
    expect(doc.account).toMatchObject({ id: 7, email: 'ana@example.com' })
    expect(doc.orders[0]).toMatchObject({ orderNumber: 'A-1001', amount: 12345, customerEmail: 'ana@example.com' })
    expect(doc.notIncluded.join(' ')).toMatch(/Wishlist/)
  })

  it('reads the customer records through the engine and the form entries by email', async () => {
    const { engine } = fakeEngine({
      orders: [order],
      addresses: [{ id: 3, city: 'Sydney' }],
      'event-rsvps': [{ id: 5, name: 'Ana', email: 'ana@example.com', guestCount: 1 }],
    })
    const { d1 } = fakeD1([
      { id: 1, form_id: 4, values: JSON.stringify({ email: 'ana@example.com', message: 'mine' }), submitted_at: '2026-04-01' },
      { id: 2, form_id: 4, values: JSON.stringify({ email: 'ana@example.com.au' }), submitted_at: '2026-04-02' },
    ])
    const doc = (await exportCustomerData(engine, d1 as never, user as never, new Date('2026-10-31T00:00:00.000Z'))) as {
      formSubmissions: unknown[]
      bookings: unknown[]
      addresses: unknown[]
    }
    expect(doc.formSubmissions).toHaveLength(1)
    expect(doc.bookings).toHaveLength(1)
    expect(doc.addresses).toHaveLength(1)
    expect(JSON.stringify(doc)).not.toContain('pbkdf2$secret-hash')
  })

  it('leaves guest bookings out of the export until the customer address is verified', async () => {
    const { engine } = fakeEngine({ orders: [], addresses: [], 'event-rsvps': [{ id: 5, name: 'Ana', email: 'ana@example.com', guestCount: 1 }] })
    const { d1 } = fakeD1()
    const unverified: typeof user & { emailVerifiedAt: string | null } = { ...user, emailVerifiedAt: null }
    const doc = (await exportCustomerData(engine, d1 as never, unverified as never, new Date('2026-10-31T00:00:00.000Z'))) as { bookings: unknown[] }
    expect(doc.bookings).toEqual([])
  })
})

describe('erasure', () => {
  it('anonymises orders but keeps the totals, and never deletes them', async () => {
    const { engine, writes } = fakeEngine({ orders: [order], addresses: [{ id: 3 }], 'event-rsvps': [] })
    const { d1 } = fakeD1()
    const counts = await eraseCustomerData(engine, d1 as never, 7, 'ana@example.com')

    const orderWrites = writes.filter((w) => w.collection === 'orders')
    expect(orderWrites).toHaveLength(1)
    expect(orderWrites[0].op).toBe('update')
    expect(orderWrites[0].data).toEqual(anonymisedOrderPatch())
    for (const key of ['amount', 'taxTotal', 'lineItems', 'orderNumber']) expect(orderWrites[0].data).not.toHaveProperty(key)
    expect(writes.some((w) => w.collection === 'orders' && w.op === 'delete')).toBe(false)

    const patch = JSON.stringify(anonymisedOrderPatch())
    for (const personal of ['Ana', 'Silva', 'Test Street', 'Leave at the gate', 'Happy birthday', 'ana@example.com']) {
      expect(patch).not.toContain(personal)
    }
    expect(counts.orders).toBe(1)
  })

  it('removes the account and its sessions, keys, passkeys and codes', async () => {
    const { engine, writes } = fakeEngine({ orders: [], addresses: [], 'event-rsvps': [] })
    const { d1, calls } = fakeD1()
    await eraseCustomerData(engine, d1 as never, 7, 'ana@example.com')
    const sqlText = calls.map((c) => c.sql).join('\n')
    for (const table of ['eg_user_sessions', 'eg_api_keys', 'eg_passkeys', 'eg_trusted_devices', 'eg_login_tokens', 'eg_two_factor_email_codes']) {
      expect(sqlText).toContain(`DELETE FROM ${table}`)
    }
    expect(writes).toContainEqual({ op: 'delete', collection: 'users', id: 7 })
  })

  it('keeps form submissions and booking entries: they are never deleted or anonymised', async () => {
    const booking = { id: 5, name: 'Ana', email: 'ana@example.com', guestCount: 2, notes: 'Vegetarian' }
    const { engine, writes } = fakeEngine({ orders: [order], addresses: [{ id: 3 }], 'event-rsvps': [booking] })
    const { d1, calls } = fakeD1([{ id: 1, form_id: 4, values: JSON.stringify({ email: 'ana@example.com', message: 'Hi' }), submitted_at: '2026-04-01' }])
    const counts = await eraseCustomerData(engine, d1 as never, 7, 'ana@example.com')

    expect(writes.filter((w) => w.collection === 'event-rsvps')).toEqual([])
    expect(writes.filter((w) => w.collection === 'form-submissions')).toEqual([])
    expect(calls.some((c) => /DELETE\s+FROM\s+eg_form_submissions/i.test(c.sql))).toBe(false)
    expect(calls.some((c) => /UPDATE\s+eg_form_submissions/i.test(c.sql))).toBe(false)
    expect(counts).not.toHaveProperty('bookings')
    expect(counts).not.toHaveProperty('formEntries')
    // The account, sessions and keys still go.
    expect(writes).toContainEqual({ op: 'delete', collection: 'users', id: 7 })
  })

  it('still anonymises orders and removes addresses while the bookings stay', async () => {
    const { engine, writes } = fakeEngine({ orders: [order], addresses: [{ id: 3 }], 'event-rsvps': [{ id: 5, email: 'ana@example.com' }] })
    const counts = await eraseCustomerData(engine, fakeD1().d1 as never, 7, 'ana@example.com')
    expect(writes).toContainEqual({ op: 'delete', collection: 'addresses', id: 3 })
    expect(writes.some((w) => w.collection === 'event-rsvps')).toBe(false)
    expect(counts).toMatchObject({ orders: 1, addresses: 1, accountRecords: 1 })
  })

  it('keeps the customer own form and booking entries in the export, which the erasure leaves alone', async () => {
    const { engine } = fakeEngine({ orders: [], addresses: [], 'event-rsvps': [{ id: 5, name: 'Ana', email: 'ana@example.com', guestCount: 1 }] })
    const { d1 } = fakeD1([{ id: 1, form_id: 4, values: JSON.stringify({ email: 'ana@example.com' }), submitted_at: '2026-04-01' }])
    const doc = (await exportCustomerData(engine, d1 as never, user as never, new Date('2026-10-31T00:00:00.000Z'))) as {
      bookings: unknown[]
      formSubmissions: unknown[]
    }
    expect(doc.bookings).toHaveLength(1)
    expect(doc.formSubmissions).toHaveLength(1)
  })

  it('strips secret-looking keys at every depth', () => {
    expect(stripSecrets({ a: 1, nested: { passwordHash: 'x', keep: [{ salt: 's', name: 'n' }] } })).toEqual({ a: 1, nested: { keep: [{ name: 'n' }] } })
  })
})

describe('privacy request storage and the 30-day clock (fresh D1)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
  }, 120_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('creates the table and indexes, is safe to run twice, and round-trips a request through every status', async () => {
    const mod = await import('@/migrations/20270124_100000_privacy_requests')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const indexes = (await proxy.env.D1.prepare('PRAGMA index_list(`eg_privacy_requests`)').all()).results as { name: string }[]
    expect(indexes.map((i) => i.name)).toEqual(expect.arrayContaining(['eg_privacy_requests_status_idx', 'eg_privacy_requests_user_idx']))

    const store = createD1PrivacyStore(async () => proxy.env.D1 as never)
    const now = new Date('2026-10-31T10:00:00.000Z')
    const opened = await openDeletionRequest({ store, userId: 7, email: 'ana@example.com', siteOrigin: 'https://shop.example', now })
    expect(opened.ok).toBe(true)
    const again = await openDeletionRequest({ store, userId: 7, email: 'ana@example.com', siteOrigin: 'https://shop.example', now })
    expect(again.ok).toBe(false)

    const row = await store.openForUser(7)
    expect(row).toMatchObject({ status: 'unverified', dueAt: '2026-11-30T10:00:00.000Z' })
    expect(row.verifyHash).toMatch(/^[0-9a-f]{64}$/)

    const bad = await confirmDeletionByToken(store, 'not-a-real-token', now)
    expect(bad).toMatchObject({ ok: false, code: 'invalid' })

    // The emailed link is the only way out of "unverified". Recreate a known token for the test.
    const known = 'known-test-token-0123456789-abcdefghijklmnopqrstuvwxyz'
    await store.update(row.id, { verifyHash: hashVerifyToken(known), verifyExpiresAt: '2026-11-01T10:00:00.000Z' }, now.toISOString())
    const confirmed = await confirmDeletionByToken(store, known, now)
    expect(confirmed.ok).toBe(true)
    expect(await store.findByVerifyHash(hashVerifyToken(known))).toBeNull()
    expect((await store.findById(row.id)).status).toBe('new')

    const approved = await decideRequest(store, row.id, 'approve', 1, now)
    expect(approved).toEqual({ ok: true, value: 'in_progress' })
    const rejectedWhileOpen = await decideRequest(store, row.id, 'reject', 1, now)
    expect(rejectedWhileOpen).toEqual({ ok: true, value: 'rejected' })
    expect((await store.list(10)).map((r) => r.id)).toContain(row.id)
    expect(await store.openForUser(7)).toBeNull()
  })

  it('erases a customer end to end: orders anonymised, the request keeps counts only and no address', async () => {
    const store = createD1PrivacyStore(async () => proxy.env.D1 as never)
    const now = new Date('2026-10-31T10:00:00.000Z')
    await openDeletionRequest({ store, userId: 9, email: 'ben@example.com', siteOrigin: 'https://shop.example', now })
    const row = await store.openForUser(9)
    const known = 'erase-test-token-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    await store.update(row.id, { verifyHash: hashVerifyToken(known), verifyExpiresAt: '2026-11-01T10:00:00.000Z' }, now.toISOString())
    expect((await confirmDeletionByToken(store, known, now)).ok).toBe(true)
    expect(await executeErasure({ store, engine: fakeEngine({}).engine, d1: fakeD1().d1 as never, id: row.id, actorId: 1, now })).toMatchObject({ ok: false })

    await decideRequest(store, row.id, 'approve', 1, now)
    const { engine, writes } = fakeEngine({ orders: [order], addresses: [], 'event-rsvps': [] })
    const result = await executeErasure({ store, engine, d1: fakeD1().d1 as never, id: row.id, actorId: 1, now })
    expect(result).toMatchObject({ ok: true, value: { emailed: true } })
    expect(writes.filter((w) => w.collection === 'orders' && w.op === 'update')).toHaveLength(1)
    const after = await store.findById(row.id)
    expect(after).toMatchObject({ status: 'done', email: 'erased', userId: null, result: { orders: 1, accountRecords: 1 } })
    expect(JSON.stringify(after)).not.toContain('ben@example.com')
  })
})

describe('privacy copy in every language', () => {
  const COPY_KEYS = ['privacy.delete.body', 'privacy.admin.eraseConfirm'] as const

  it('English says that form and booking submissions are kept and visible only to staff with permission', () => {
    for (const key of COPY_KEYS) expect(UI_STRING_SOURCE[key], key).toMatch(/Form and booking/)
    expect(UI_STRING_SOURCE['privacy.delete.body']).toMatch(/only staff with permission/)
    expect(UI_STRING_SOURCE['privacy.admin.eraseConfirm']).toMatch(/visible only to staff with permission/)
  })

  it('every dictionary carries its own translation of the erase copy and the result line', async () => {
    for (const locale of Object.keys(DICTIONARY_LOADERS) as (keyof typeof DICTIONARY_LOADERS)[]) {
      const dictionary = (await DICTIONARY_LOADERS[locale]()).default
      for (const key of COPY_KEYS) {
        expect(dictionary[key], `${locale} ${key}`).toBeTruthy()
        expect(dictionary[key], `${locale} ${key}`).not.toBe(UI_STRING_SOURCE[key])
      }
      expect(dictionary['privacy.admin.result'], `${locale} result`).not.toMatch(/\{(bookings|formEntries)\}/)
    }
  })
})

