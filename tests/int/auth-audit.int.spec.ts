// @vitest-environment node
// The audit trail for account security. Writes and reads run against a real SQLite table (node:sqlite),
// through a D1-shaped adapter, so the SQL the admin screen and the writers use is the SQL that executes.
// Sign-in and verification outcomes run through the real account service against a stub engine.
import { DatabaseSync } from 'node:sqlite'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const d1State = vi.hoisted(() => ({ adapter: null as unknown }))
const settingsState = vi.hoisted(() => ({ auditEnabled: true, unreadable: false }))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async (): Promise<{ env: { D1: unknown } }> => ({ env: { D1: d1State.adapter } }),
}))

vi.mock('@/cms/db/connect', () => ({
  resolveD1Binding: async (): Promise<unknown> => d1State.adapter,
}))

vi.mock('@/features/security/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/security/settings')>()
  return {
    ...actual,
    getSecuritySettings: async () => {
      if (settingsState.unreadable) throw new Error('settings unreadable')
      return {
        ...actual.DEFAULT_SECURITY_SETTINGS,
        featureEnabled: true,
        auditLog: { ...actual.DEFAULT_SECURITY_SETTINGS.auditLog, enabled: settingsState.auditEnabled },
      }
    },
  }
})

vi.mock('@/features/security/userSessionStore', () => ({ defaultUserSessionStore: {} }))
vi.mock('@/features/security/userSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/security/userSessions')>()
  return { ...actual, revokeOtherSessions: async (): Promise<number> => 0 }
})

import { AUTH_AUDIT_ACTIONS, type AuditAction } from '@/features/security/auditLog'
import { recordAuthEvent, originFromHeaders } from '@/features/security/authAudit'
import { AUDIT_PAGE_SIZE, auditPageHref, buildAuditSelect, parseAuditFilter } from '@/features/security/auditQuery'
import { listAuthAuditPage } from '@/features/security/auditStore'
import { revokeSessionsOnPasswordChange } from '@/features/security/passwordSessionHook'
import { completeVerification, signIn, signInWithCode } from '@/features/accounts/auth'

/** A D1-shaped adapter over a real in-memory SQLite database. */
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

const CREATE_TABLE = `CREATE TABLE eg_audit_log (
  id integer PRIMARY KEY NOT NULL,
  action text NOT NULL,
  actor_id numeric,
  actor_email text,
  collection_slug text,
  document_id text,
  ip text,
  user_agent text,
  detail text,
  updated_at text NOT NULL,
  created_at text NOT NULL
)`

let db: DatabaseSync

/** Inserts a row with an explicit timestamp so ordering is deterministic. */
type SeedValue = string | number | null
function seed(action: string, at: string, extra: Partial<Record<'actor_id' | 'actor_email' | 'collection_slug' | 'document_id' | 'ip' | 'user_agent' | 'detail', SeedValue>> = {}): void {
  const row: Record<string, SeedValue> = { actor_id: null, actor_email: null, collection_slug: null, document_id: null, ip: null, user_agent: null, detail: null, ...extra }
  db.prepare(
    'INSERT INTO eg_audit_log (action, actor_id, actor_email, collection_slug, document_id, ip, user_agent, detail, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(action, row.actor_id, row.actor_email, row.collection_slug, row.document_id, row.ip, row.user_agent, row.detail, at, at)
}

function rowsFor(filter: Parameters<typeof buildAuditSelect>[0], pageSize?: number): Array<Record<string, unknown>> {
  const { sql, binds } = buildAuditSelect(filter, pageSize)
  return db.prepare(sql).all(...(binds as never[])) as Array<Record<string, unknown>>
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(CREATE_TABLE)
  d1State.adapter = sqliteD1(db)
  settingsState.auditEnabled = true
  settingsState.unreadable = false
})

describe('audit vocabulary', () => {
  it('covers every account-security event the screen must show, once each', () => {
    const required: AuditAction[] = [
      'login.success', 'login.failed', 'login.locked', 'logout',
      'password.changed', 'password.reset', 'email.verified', 'email.refused',
      'two-factor.enrolled', 'two-factor.failed', 'two-factor.verified', 'two-factor.disabled',
      'passkey.registered', 'passkey.removed',
      'api-key.created', 'api-key.revoked',
      'social.linked', 'social.unlinked',
      'session.revoked', 'session.revoked-others', 'session.admin-revoked',
      'impersonation.started', 'impersonation.ended',
    ]
    for (const action of required) expect(AUTH_AUDIT_ACTIONS).toContain(action)
    expect(new Set(AUTH_AUDIT_ACTIONS).size).toBe(AUTH_AUDIT_ACTIONS.length)
  })
})

describe('filters and paging', () => {
  it('drops an unknown action and an empty account, and reads a bad page as the first', () => {
    expect(parseAuditFilter({ action: 'content.delete', user: '   ', page: 'x' })).toEqual({ action: null, user: null, page: 1 })
    expect(parseAuditFilter({ action: 'logout', user: ' ann@example.com ', page: '3' })).toEqual({ action: 'logout', user: 'ann@example.com', page: 3 })
  })

  it('lists only account-security events, newest first', () => {
    seed('logout', '2026-10-01T10:00:00.000Z')
    seed('create', '2026-10-02T10:00:00.000Z', { collection_slug: 'posts' })
    seed('login.failed', '2026-10-03T10:00:00.000Z', { actor_email: 'a@example.com' })
    seed('consent.update', '2026-10-04T10:00:00.000Z')

    const rows = rowsFor(parseAuditFilter({}))
    expect(rows.map((row) => row.action)).toEqual(['login.failed', 'logout'])
  })

  it('filters by one event', () => {
    seed('login.failed', '2026-10-01T10:00:00.000Z')
    seed('login.locked', '2026-10-02T10:00:00.000Z')
    seed('logout', '2026-10-03T10:00:00.000Z')
    expect(rowsFor(parseAuditFilter({ action: 'login.locked' })).map((row) => row.action)).toEqual(['login.locked'])
  })

  it('filters by account email (substring, any case) and by numeric account id', () => {
    seed('login.failed', '2026-10-01T10:00:00.000Z', { actor_email: 'Ann@Example.com' })
    seed('login.success', '2026-10-02T10:00:00.000Z', { actor_id: 7, actor_email: 'bob@example.com' })
    seed('logout', '2026-10-03T10:00:00.000Z', { actor_id: 8, actor_email: 'carol@example.com' })

    expect(rowsFor(parseAuditFilter({ user: 'ann@example' })).map((row) => row.actor_email)).toEqual(['Ann@Example.com'])
    expect(rowsFor(parseAuditFilter({ user: '7' })).map((row) => row.actor_id)).toEqual([7])
  })

  it('searches LIKE wildcards literally, so a typed percent sign does not match everything', () => {
    seed('logout', '2026-10-01T10:00:00.000Z', { actor_email: 'ann@example.com' })
    expect(rowsFor(parseAuditFilter({ user: '%' }))).toEqual([])
    expect(rowsFor(parseAuditFilter({ user: '_' }))).toEqual([])
  })

  it('pages newest first and reports whether an older page exists', () => {
    for (let i = 0; i < 5; i += 1) seed('logout', `2026-10-0${i + 1}T10:00:00.000Z`)

    const first = rowsFor(parseAuditFilter({}), 2)
    expect(first).toHaveLength(3) // one extra row fetched to detect the next page
    expect(first[0]?.created_at).toBe('2026-10-05T10:00:00.000Z')

    const second = rowsFor(parseAuditFilter({ page: '2' }), 2)
    expect(second.map((row) => row.created_at)).toEqual(['2026-10-03T10:00:00.000Z', '2026-10-02T10:00:00.000Z', '2026-10-01T10:00:00.000Z'])
  })

  it('keeps the filters when linking to another page', () => {
    expect(auditPageHref({ action: 'logout', user: 'ann', page: 1 }, 2)).toBe('?action=logout&user=ann&page=2')
    expect(auditPageHref({ action: null, user: null, page: 2 }, 1)).toBe('?')
    expect(AUDIT_PAGE_SIZE).toBeGreaterThan(0)
  })

  it('the screen reads one page through the same query', async () => {
    seed('password.changed', '2026-10-01T10:00:00.000Z', { actor_id: 3, actor_email: 'ann@example.com', document_id: '3', detail: 'own account' })
    seed('create', '2026-10-02T10:00:00.000Z')

    const page = await listAuthAuditPage(parseAuditFilter({}), 10)
    expect(page.hasNext).toBe(false)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]).toMatchObject({ action: 'password.changed', actorId: 3, actorEmail: 'ann@example.com', detail: 'own account' })
  })
})

describe('recording', () => {
  it('writes the event with its actor and the origin it was given', async () => {
    await recordAuthEvent({}, { action: 'login.failed', actorEmail: 'ann@example.com', detail: 'password step' }, { ip: '203.0.113.9', userAgent: 'UA/1' })

    const [row] = db.prepare('SELECT * FROM eg_audit_log').all() as Array<Record<string, unknown>>
    expect(row).toMatchObject({ action: 'login.failed', actor_email: 'ann@example.com', detail: 'password step', ip: '203.0.113.9', user_agent: 'UA/1' })
  })

  it('writes nothing while the audit log is switched off', async () => {
    settingsState.auditEnabled = false
    await recordAuthEvent({}, { action: 'logout' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM eg_audit_log').get()).toEqual({ n: 0 })
  })

  it('never throws when the settings cannot be read', async () => {
    settingsState.unreadable = true
    await expect(recordAuthEvent({}, { action: 'logout' })).resolves.toBeUndefined()
    expect(db.prepare('SELECT COUNT(*) AS n FROM eg_audit_log').get()).toEqual({ n: 0 })
  })

  it('never throws when the database refuses the write', async () => {
    d1State.adapter = { prepare: () => { throw new Error('D1 unavailable') } }
    await expect(recordAuthEvent({}, { action: 'logout' })).resolves.toBeUndefined()
  })

  it('reads the address and agent from request headers, and tolerates none', () => {
    const headers = new Headers({ 'cf-connecting-ip': '198.51.100.4', 'user-agent': 'Browser/2' })
    expect(originFromHeaders(headers)).toEqual({ ip: '198.51.100.4', userAgent: 'Browser/2' })
    expect(originFromHeaders(null)).toEqual({})
  })

  it('the password-change hook records who changed whose password, own or another account', async () => {
    const own = { id: 5, email: 'ann@example.com' }
    await revokeSessionsOnPasswordChange({
      doc: own,
      data: { password: 'a-new-long-password' },
      operation: 'update',
      req: { user: { id: 5 }, currentSessionId: 'sess-1', engine: {}, headers: new Headers({ 'user-agent': 'UA' }) },
    } as never)
    // The profile path passes no session id; the event is still written.
    await revokeSessionsOnPasswordChange({
      doc: { id: 9, email: 'bob@example.com' },
      data: { password: 'another-long-password' },
      operation: 'update',
      req: { user: { id: 1 }, engine: {} },
    } as never)

    const rows = db.prepare("SELECT action, actor_id, document_id, detail FROM eg_audit_log WHERE action = 'password.changed' ORDER BY id").all()
    expect(rows).toEqual([
      { action: 'password.changed', actor_id: 5, document_id: '5', detail: 'own account' },
      { action: 'password.changed', actor_id: 1, document_id: '9', detail: 'another account' },
    ])
  })

  it('does not record a save that did not change the password', async () => {
    await revokeSessionsOnPasswordChange({
      doc: { id: 5 },
      data: { name: 'Ann' },
      operation: 'update',
      req: { user: { id: 5 }, engine: {} },
    } as never)
    expect(db.prepare('SELECT COUNT(*) AS n FROM eg_audit_log').get()).toEqual({ n: 0 })
  })
})

describe('sign-in and verification outcomes', () => {
  const lockedError = (): Error => Object.assign(new Error('locked'), { name: 'LockedAuth' })

  it('a wrong password is a plain failure, and a locked account says so only to the audit log', async () => {
    const plain = { login: async (): Promise<never> => { throw new Error('bad password') }, findGlobal: async (): Promise<null> => null }
    const locked = { login: async (): Promise<never> => { throw lockedError() }, findGlobal: async (): Promise<null> => null }

    const failed = await signIn(plain as never, 'ann@example.com', 'wrong')
    const lock = await signIn(locked as never, 'ann@example.com', 'wrong')

    expect(failed).toMatchObject({ ok: false, reason: 'failed' })
    expect(lock).toMatchObject({ ok: false, reason: 'locked' })
    // The message shown to the person is the same for both, so the lockout is not revealed.
    expect(failed.message).toBe(lock.message)
  })

  it('a successful sign-in returns the account it belongs to', async () => {
    const engine = {
      login: async () => ({ token: 'tok', user: { id: 7, email: 'ann@example.com' } }),
      findGlobal: async (): Promise<null> => null,
    }
    expect(await signIn(engine as never, 'ann@example.com', 'right')).toMatchObject({ ok: true, token: 'tok', userId: 7 })
  })

  it('a wrong or locked second-step code is classified the same way', async () => {
    const wrong = { loginSecondFactor: async () => { throw new Error('bad code') } }
    const locked = { loginSecondFactor: async () => { throw lockedError() } }
    expect(await signInWithCode(wrong as never, 'pending', '000000')).toMatchObject({ ok: false, reason: 'failed' })
    expect(await signInWithCode(locked as never, 'pending', '000000')).toMatchObject({ ok: false, reason: 'locked' })
  })

  it('a verified email returns the account; an expired or reused link returns no account', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const engine = {
      find: async () => ({ docs: [{ id: 11, emailVerifyExpiresAt: future }] }),
      update: async () => ({}),
    }
    expect(await completeVerification(engine as never, 'token-a')).toEqual({ ok: true, userId: 11 })

    const stale = { find: async () => ({ docs: [{ id: 11, emailVerifyExpiresAt: '2000-01-01T00:00:00.000Z' }] }), update: async () => ({}) }
    const refused = await completeVerification(stale as never, 'token-b')
    expect(refused.ok).toBe(false)
    expect(refused.userId).toBeUndefined()
  })
})
