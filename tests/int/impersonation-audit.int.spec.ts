// @vitest-environment node
// Audit entries written while an admin is signed in as a customer. The audit table is a real SQLite
// table behind the same D1-shaped adapter the auth-audit spec uses. The impersonation table is a
// stub, so each test decides whether the cookie names an open, matching row.
import { DatabaseSync } from 'node:sqlite'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const d1State = vi.hoisted(() => ({ adapter: null as unknown }))
const storeState = vi.hoisted(() => ({ rows: {} as Record<string, unknown> }))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async (): Promise<{ env: { D1: unknown } }> => ({ env: { D1: d1State.adapter } }),
}))

vi.mock('@/features/impersonation/store', () => ({
  defaultImpersonationStore: { findByID: async (id: string): Promise<unknown> => storeState.rows[id] ?? null },
}))

vi.mock('@/features/security/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/security/settings')>()
  return {
    ...actual,
    getSecuritySettings: async () => ({
      ...actual.DEFAULT_SECURITY_SETTINGS,
      featureEnabled: true,
      auditLog: { ...actual.DEFAULT_SECURITY_SETTINGS.auditLog, enabled: true },
    }),
  }
})

import { auditTagFor, IMPERSONATION_COOKIE } from '@/features/impersonation/policy'
import { recordAuthEvent } from '@/features/security/authAudit'
import { impersonatorTag } from '@/features/security/auditLog'

const FUTURE = new Date(Date.now() + 30 * 60_000).toISOString()
const PAST = new Date(Date.now() - 60_000).toISOString()

/** A token-shaped string whose payload carries the impersonation claim. Only the payload is read, unverified. */
const tokenFor = (impId: string): string => {
  const payload = Buffer.from(JSON.stringify({ imp: { adminId: 1, impId } })).toString('base64url')
  return `header.${payload}.signature`
}
const cookieFor = (impId: string): string => `engage-token=admin-session; ${IMPERSONATION_COOKIE}=${tokenFor(impId)}`

const openRow: { id: string; adminId: number; adminEmail: string; targetUserId: number; targetEmail: string; endedAt: string | null; expiresAt: string } = {
  id: 'imp-1',
  adminId: 1,
  adminEmail: 'admin@example.com',
  targetUserId: 42,
  targetEmail: 'customer@example.com',
  endedAt: null,
  expiresAt: FUTURE,
}

function sqliteD1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      const statement = (values: unknown[]) => ({
        bind: (...more: unknown[]) => statement([...values, ...more]),
        run: async () => {
          stmt.run(...(values as never[]))
          return {}
        },
        all: async () => ({ results: stmt.all(...(values as never[])) }),
        first: async () => stmt.get(...(values as never[])) ?? null,
      })
      return statement([])
    },
  }
}

let db: DatabaseSync

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE eg_audit_log (
    id integer PRIMARY KEY NOT NULL, action text NOT NULL, actor_id numeric, actor_email text,
    collection_slug text, document_id text, ip text, user_agent text, detail text,
    updated_at text NOT NULL, created_at text NOT NULL)`)
  d1State.adapter = sqliteD1(db)
  storeState.rows = { 'imp-1': openRow }
})

const onlyRow = () => db.prepare('SELECT * FROM eg_audit_log').all() as Array<Record<string, unknown>>

describe('auditTagFor (the rule)', () => {
  const now = Date.now()

  it('names the admin for an open, unexpired row whose customer is the actor', () => {
    expect(auditTagFor(openRow, 42, now)).toEqual({ actorId: 1, impersonating: 42 })
  })

  it('names nobody for an ended, expired, or unknown row', () => {
    expect(auditTagFor({ ...openRow, endedAt: PAST }, 42, now)).toBeNull()
    expect(auditTagFor({ ...openRow, expiresAt: PAST }, 42, now)).toBeNull()
    expect(auditTagFor(null, 42, now)).toBeNull()
  })

  it('names nobody when the actor is not the customer the row describes', () => {
    expect(auditTagFor(openRow, 7, now)).toBeNull()
  })
})

describe('impersonatorTag', () => {
  it('returns null without a cookie or actor', async () => {
    expect(await impersonatorTag(null, 42)).toBeNull()
    expect(await impersonatorTag(cookieFor('imp-1'), null)).toBeNull()
  })

  it('returns the real admin for a live impersonation of this actor', async () => {
    expect(await impersonatorTag(cookieFor('imp-1'), 42)).toEqual({ actorId: 1, actorEmail: 'admin@example.com', impersonating: 42 })
  })

  it('returns null for a forged impersonation id that matches no row', async () => {
    expect(await impersonatorTag(cookieFor('not-a-row'), 42)).toBeNull()
  })
})

describe('recording while impersonating', () => {
  it('a logout by the customer is written as the admin, with the customer named in the detail', async () => {
    await recordAuthEvent({}, { action: 'logout', actorId: 42, actorEmail: 'customer@example.com', detail: 'this device' }, { ip: '203.0.113.9', userAgent: 'UA/1', cookie: cookieFor('imp-1') })

    expect(onlyRow()[0]).toMatchObject({
      action: 'logout',
      actor_id: 1,
      actor_email: 'admin@example.com',
      detail: 'impersonating: 42; this device',
      ip: '203.0.113.9',
    })
  })

  it('an ordinary request is written as the actor, with no tag', async () => {
    await recordAuthEvent({}, { action: 'logout', actorId: 42, actorEmail: 'customer@example.com', detail: 'this device' }, { ip: null, userAgent: null })

    expect(onlyRow()[0]).toMatchObject({ actor_id: 42, actor_email: 'customer@example.com', detail: 'this device' })
  })

  it('a forged cookie leaves the entry as the actor it was', async () => {
    await recordAuthEvent({}, { action: 'logout', actorId: 42, actorEmail: 'customer@example.com' }, { cookie: cookieFor('not-a-row') })

    expect(onlyRow()[0]).toMatchObject({ actor_id: 42, actor_email: 'customer@example.com', detail: null })
  })
})
