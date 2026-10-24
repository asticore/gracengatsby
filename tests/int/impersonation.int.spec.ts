// @vitest-environment node
// Admin impersonation ("sign in as customer"). The rules run against in-memory doubles for the
// store, the audit log and the admin's re-authentication. The session itself is real: loginAsUser,
// verifyAuth and refreshToken from the Local API run against an in-memory auth table and session
// table, so the claims, the expiry and the revocation are the ones production uses.
// Restricted actions are called directly with next/headers mocked to carry the impersonation cookie.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cookieState = vi.hoisted(() => ({ cookieHeader: '' as string }))
vi.mock('next/headers', () => ({
  headers: async (): Promise<{ get: (name: string) => string | null }> => ({
    get: (name: string): string | null => (name.toLowerCase() === 'cookie' ? cookieState.cookieHeader || null : null),
  }),
  cookies: async (): Promise<{ get: () => undefined; set: () => void; delete: () => void }> => ({
    get: (): undefined => undefined,
    set: (): void => undefined,
    delete: (): void => undefined,
  }),
}))

import * as accountsActions from '@/features/accounts/actions'
import * as twoFactorActions from '@/features/security/twoFactorActions'
import * as userSessionActions from '@/features/security/userSessionActions'
import * as apiKeyActions from '@/features/apiKeys/actions'
import * as socialActions from '@/features/socialLogin/actions'
import * as passkeyHttp from '@/features/accounts/passkeysHttp'
import * as paypalCreateRoute from '@/app/(engage)/api/shop-paypal-create/route'
import * as paypalCaptureRoute from '@/app/(engage)/api/shop-paypal-capture/route'
import {
  AuthenticationError,
  loginAsUser,
  refreshToken,
  verifyAuth,
  type AuthDbOps,
  type AuthUserRow,
} from '@/localapi/auth'
import { DEFAULT_SECURITY_SETTINGS, impersonationFrom, rowToSettings, type ImpersonationSettings } from '@/features/security/settings'
import { checkSession, listSessions, openSession, type UserSessionRow, type UserSessionStore } from '@/features/security/userSessions'
import {
  clampMinutes,
  cookieValue,
  headersForCustomerView,
  IMPERSONATION_COOKIE,
  isImpersonating,
  normaliseReason,
  refuseWhileImpersonating,
  REFUSED_WHILE_IMPERSONATING,
  sessionSecondsFor,
  unverifiedClaims,
} from '@/features/impersonation/policy'
import {
  impersonationHistory,
  impersonationIdFromClaims,
  startImpersonation,
  stopImpersonation,
  type ImpersonationAudit,
  type ImpersonationDeps,
  type ImpersonationRow,
  type ImpersonationStore,
  type SessionOrder,
} from '@/features/impersonation/service'

const NOW = Date.parse('2026-10-24T10:00:00.000Z')
const SECRET = 'test-secret-for-impersonation'
const ON: ImpersonationSettings = { enabled: true, maxMinutes: 30, requireTwoFactor: true }
const PASSWORD = 'a long enough passphrase'

// --- Doubles -------------------------------------------------------------------

function sessionStore(): UserSessionStore & { rows: UserSessionRow[] } {
  const rows: UserSessionRow[] = []
  return {
    rows,
    async insert(row) {
      rows.push({ ...row })
    },
    async findByID(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async listActiveForUser(userId, now) {
      return rows.filter((r) => r.userId === userId && !r.revokedAt && r.expiresAt > now)
    },
    async touch(id, lastSeenAt) {
      const r = rows.find((x) => x.id === id)
      if (r) r.lastSeenAt = lastSeenAt
    },
    async extend(id, expiresAt) {
      const r = rows.find((x) => x.id === id)
      if (r && !r.revokedAt) r.expiresAt = expiresAt
    },
    async revoke(id, userId, at) {
      const r = rows.find((x) => x.id === id && x.userId === userId && !x.revokedAt)
      if (!r) return false
      r.revokedAt = at
      return true
    },
    async revokeForUser(userId, exceptId, at) {
      let n = 0
      for (const r of rows) if (r.userId === userId && r.id !== exceptId && !r.revokedAt) {
        r.revokedAt = at
        n += 1
      }
      return n
    },
  }
}

type Account = { id: number; email: string; roles: string[]; locked?: boolean; twoStep?: boolean }

/** The engine-facing auth table: the same contract as the real users table, in memory. */
function authTable(accounts: Account[], sessions: UserSessionStore) {
  const rows = new Map<number, AuthUserRow>()
  for (const a of accounts) {
    rows.set(a.id, {
      id: a.id,
      email: a.email,
      roles: a.roles,
      salt: null,
      hash: null,
      loginAttempts: 0,
      lockUntil: a.locked ? new Date(NOW + 3_600_000).toISOString() : null,
      sessions: [],
      twoFactorEnabled: Boolean(a.twoStep),
      twoFactorSecret: a.twoStep ? 'secret' : null,
      twoFactorConfirmedAt: a.twoStep ? new Date(NOW - 1000).toISOString() : null,
      twoFactorLastUsedStep: null,
      twoFactorBackupHashes: null,
      updatedAt: new Date(NOW).toISOString(),
      createdAt: new Date(NOW).toISOString(),
    })
  }
  const db: AuthDbOps = {
    sessions,
    findByEmail: async (email) => [...rows.values()].find((r) => r.email === email) ?? null,
    findByID: async (id) => (rows.get(id) ? { ...(rows.get(id) as AuthUserRow), sessions: [...((rows.get(id) as AuthUserRow).sessions ?? [])] } : null),
    findByResetToken: async () => null,
    updateByID: async (id, data) => {
      const current = rows.get(id)
      if (!current) return null
      const next = { ...current, ...(data as Partial<AuthUserRow>), id } as AuthUserRow
      rows.set(id, next)
      return next
    },
  }
  return { db, rows }
}

const tokenHeaders = (token: string) => ({ get: (name: string) => (name === 'Cookie' ? `engage-token=${token}` : null) })

type Harness = ReturnType<typeof harness>

function harness(opts: { settings?: Partial<ImpersonationSettings>; accounts?: Account[]; adminHas2fa?: boolean; reauthOk?: boolean; signInThrows?: boolean } = {}) {
  const accounts: Account[] = opts.accounts ?? [
    { id: 1, email: 'ana@example.com', roles: ['admin'] },
    { id: 2, email: 'cara@example.com', roles: ['customer'] },
    { id: 3, email: 'ed@example.com', roles: ['editor'] },
    { id: 4, email: 'vic@example.com', roles: ['viewer'] },
    { id: 5, email: 'sam@example.com', roles: ['customer'], locked: true },
    { id: 6, email: 'mix@example.com', roles: ['customer', 'admin'] },
    { id: 7, email: 'two@example.com', roles: ['customer'], twoStep: true },
  ]
  const sessions = sessionStore()
  const { db, rows } = authTable(accounts, sessions)
  const impRows: ImpersonationRow[] = []
  const audits: ImpersonationAudit[] = []
  const signInCalls: SessionOrder[] = []
  // One clock for the whole test: the system time that verifyAuth reads, and the harness's own.
  const clock = { get now() { return Date.now() } }
  let ids = 0
  const settings: ImpersonationSettings = { ...ON, ...(opts.settings ?? {}) }

  const store: ImpersonationStore = {
    async insert(row) {
      impRows.push({ ...row })
    },
    async findByID(id) {
      return impRows.find((r) => r.id === id) ?? null
    },
    async setSession(id, sessionId) {
      const r = impRows.find((x) => x.id === id)
      if (r) r.sessionId = sessionId
    },
    async end(id, at) {
      const r = impRows.find((x) => x.id === id)
      if (!r || r.endedAt) return false
      r.endedAt = at
      return true
    },
    async list(limit) {
      return [...impRows].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)
    },
  }

  const deps: ImpersonationDeps = {
    settings,
    store,
    now: () => clock.now,
    newId: () => `imp-${++ids}`,
    ordinarySessionSeconds: 7200,
    findAccountByEmail: async (email) => {
      const a = accounts.find((x) => x.email === email)
      if (!a) return null
      return { id: a.id, email: a.email, roles: a.roles, locked: Boolean(rows.get(a.id)?.lockUntil && Date.parse(rows.get(a.id)!.lockUntil!) > clock.now) }
    },
    adminHasSecondFactor: async () => opts.adminHas2fa ?? true,
    verifyReauth: async (_id, proof) => (opts.reauthOk ?? true) && (proof.password === PASSWORD || proof.code === '123456'),
    signInAs: async (target, order) => {
      signInCalls.push(order)
      if (opts.signInThrows) throw new Error('database down')
      const signed = await loginAsUser(db, { id: target.id, secret: SECRET, session: order })
      if (signed.twoFactorRequired) return { twoFactorRequired: true }
      return { token: signed.token as string }
    },
    revokeSession: async (userId, sessionId) => {
      await sessions.revoke(sessionId, userId, new Date(clock.now).toISOString())
    },
    audit: async (entry) => {
      audits.push(entry)
    },
  }

  return {
    deps,
    db,
    rows,
    sessions,
    impRows,
    audits,
    signInCalls,
    admin: { id: 1, email: 'ana@example.com', roles: ['admin'] as unknown },
    advance: (ms: number) => {
      vi.setSystemTime(Date.now() + ms)
      return Date.now()
    },
    now: () => clock.now,
  }
}

const ask = (over: Partial<Parameters<typeof startImpersonation>[2]> = {}) => ({
  targetEmail: 'cara@example.com',
  reason: 'Customer asked us to check a missing order',
  password: PASSWORD,
  alreadyImpersonating: false,
  ip: '203.0.113.9',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  cookieState.cookieHeader = ''
})

afterEach(() => {
  vi.useRealTimers()
})

// --- Settings ----------------------------------------------------------------

describe('settings', () => {
  it('is off by default, with 30 minutes and two-step required', () => {
    expect(DEFAULT_SECURITY_SETTINGS.impersonation).toEqual({ enabled: false, maxMinutes: 30, requireTwoFactor: true })
    expect(rowToSettings(null, true).impersonation.enabled).toBe(false)
  })

  it('reads the three columns and clamps the length to 5..120 minutes', () => {
    const read = (values: Record<string, unknown>) => impersonationFrom((key) => values[key])
    expect(read({})).toEqual({ enabled: false, maxMinutes: 30, requireTwoFactor: true })
    expect(read({ impersonation_enabled: 1, impersonation_max_minutes: 500, impersonation_require2fa: 0 })).toEqual({
      enabled: true,
      maxMinutes: 120,
      requireTwoFactor: false,
    })
    expect(read({ impersonation_max_minutes: 1 }).maxMinutes).toBe(5)
    expect(clampMinutes(NaN)).toBe(30)
  })

  it('never lets a session outlive the ordinary session length', () => {
    expect(sessionSecondsFor(120, 7200)).toBe(7200)
    expect(sessionSecondsFor(5, 7200)).toBe(300)
    expect(sessionSecondsFor(60, 1800)).toBe(1800)
  })
})

// --- Refusals ----------------------------------------------------------------

describe('start is refused', () => {
  it('when impersonation is disabled, before anything else happens', async () => {
    const h = harness({ settings: { enabled: false } })
    const result = await startImpersonation(h.deps, h.admin as never, ask())
    expect(result).toMatchObject({ ok: false, refusal: 'disabled' })
    expect(h.impRows).toHaveLength(0)
    expect(h.signInCalls).toHaveLength(0)
    expect(h.audits.map((a) => a.action)).toEqual(['impersonation.refused'])
  })

  it('for anyone who is not an admin', async () => {
    for (const roles of [['editor'], ['viewer'], ['customer']]) {
      const h = harness()
      const result = await startImpersonation(h.deps, { id: 9, email: 'x@example.com', roles } as never, ask())
      expect(result).toMatchObject({ ok: false, refusal: 'not_admin' })
      expect(h.signInCalls).toHaveLength(0)
    }
    const none = harness()
    expect(await startImpersonation(none.deps, null, ask())).toMatchObject({ ok: false, refusal: 'not_admin' })
  })

  it('when the request already carries an impersonation', async () => {
    const h = harness()
    expect(await startImpersonation(h.deps, h.admin as never, ask({ alreadyImpersonating: true }))).toMatchObject({ refusal: 'already_impersonating' })
  })

  it('for any target that is not an unlocked customer: missing, self, staff, locked, or a customer who is also an admin', async () => {
    const cases: Array<[string, string]> = [
      ['nobody@example.com', 'target_missing'],
      ['ana@example.com', 'self'],
      ['ed@example.com', 'not_customer'],
      ['vic@example.com', 'not_customer'],
      ['mix@example.com', 'not_customer'],
      ['sam@example.com', 'locked'],
    ]
    for (const [email, refusal] of cases) {
      const h = harness()
      const result = await startImpersonation(h.deps, h.admin as never, ask({ targetEmail: email }))
      expect(result).toMatchObject({ ok: false, refusal })
      expect(h.impRows).toHaveLength(0)
      expect(h.signInCalls).toHaveLength(0)
    }
  })

  it('when the reason is missing or shorter than five characters', async () => {
    for (const reason of ['', '   ', 'abcd', undefined, 42]) {
      const h = harness()
      const result = await startImpersonation(h.deps, h.admin as never, ask({ reason: reason as never }))
      expect(result).toMatchObject({ ok: false, refusal: 'reason' })
    }
    expect(normaliseReason('  abcde  ')).toEqual({ ok: true, value: 'abcde' })
    expect(normaliseReason('a\u0000\u0007bcdef')).toEqual({ ok: true, value: 'a bcdef' })
  })

  it('when the admin re-authentication fails, and does not start a session', async () => {
    const h = harness({ reauthOk: false })
    const result = await startImpersonation(h.deps, h.admin as never, ask())
    expect(result).toMatchObject({ ok: false, refusal: 'reauth_failed' })
    expect(h.signInCalls).toHaveLength(0)
    expect(h.impRows).toHaveLength(0)
  })

  it('when two-step sign-in is required and the admin has neither two-step nor a passkey', async () => {
    const strict = harness({ adminHas2fa: false })
    expect(await startImpersonation(strict.deps, strict.admin as never, ask())).toMatchObject({ refusal: 'second_factor_required' })
    const relaxed = harness({ adminHas2fa: false, settings: { requireTwoFactor: false } })
    expect(await startImpersonation(relaxed.deps, relaxed.admin as never, ask())).toMatchObject({ ok: true })
  })

  it('when the customer uses two-step sign-in: nothing is signed in, and the row is closed', async () => {
    const h = harness()
    const result = await startImpersonation(h.deps, h.admin as never, ask({ targetEmail: 'two@example.com' }))
    expect(result).toMatchObject({ ok: false, refusal: 'customer_two_step' })
    expect(h.impRows[0].endedAt).not.toBeNull()
  })

  it('when signing in throws, and the row is closed', async () => {
    const h = harness({ signInThrows: true })
    expect(await startImpersonation(h.deps, h.admin as never, ask())).toMatchObject({ refusal: 'start_failed' })
    expect(h.impRows[0].endedAt).not.toBeNull()
  })

  it('audits every refusal with the admin and the reason it was refused', async () => {
    const h = harness()
    await startImpersonation(h.deps, h.admin as never, ask({ targetEmail: 'ed@example.com' }))
    const refused = h.audits.find((a) => a.action === 'impersonation.refused')
    expect(refused).toMatchObject({ adminId: 1, adminEmail: 'ana@example.com', detail: expect.stringContaining('not_customer') })
  })
})

// --- Start: the session that results -----------------------------------------

describe('a successful start', () => {
  it('signs the customer in with a separate, short session carrying the admin in its claims', async () => {
    const h = harness()
    const result = await startImpersonation(h.deps, h.admin as never, ask())
    expect(result).toMatchObject({ ok: true, maxMinutes: 30, targetEmail: 'cara@example.com', impersonationId: 'imp-1' })
    const claims = unverifiedClaims((result as { token: string }).token)
    expect(claims).toMatchObject({ id: 2, imp: { adminId: 1, impId: 'imp-1' } })
    expect(claims?.exp).toBe(Math.floor(NOW / 1000) + 1800)
    expect(h.signInCalls[0]).toMatchObject({ ttlSeconds: 1800, label: 'Impersonated by ana@example.com' })
  })

  it('shows the session in the customer own list, labelled with the admin', async () => {
    const h = harness()
    const result = (await startImpersonation(h.deps, h.admin as never, ask())) as { ok: true; token: string }
    const listed = await listSessions(h.sessions, 2, NOW)
    expect(listed).toHaveLength(1)
    expect(listed[0].deviceLabel).toBe('Impersonated by ana@example.com')
    expect(impersonationIdFromClaims(unverifiedClaims(result.token))).toBe('imp-1')
    expect(h.impRows[0].sessionId).toBe(listed[0].id)
  })

  it('leaves the admin own session and row untouched', async () => {
    const h = harness()
    const adminToken = (await loginAsUser(h.db, { id: 1, secret: SECRET })).token as string
    const adminBefore = JSON.stringify(h.rows.get(1)?.sessions)
    await startImpersonation(h.deps, h.admin as never, ask())
    expect(JSON.stringify(h.rows.get(1)?.sessions)).toBe(adminBefore)
    expect(await verifyAuth(h.db, { headers: tokenHeaders(adminToken), secret: SECRET })).toMatchObject({ user: { id: 1 } })
  })

  it('caps the length at the configured minutes, clamped to 5..120, and never above the ordinary session', async () => {
    const long = harness({ settings: { maxMinutes: 500 } })
    expect(await startImpersonation(long.deps, long.admin as never, ask())).toMatchObject({ maxMinutes: 120 })
    expect(long.signInCalls[0].ttlSeconds).toBe(7200)
    const short = harness({ settings: { maxMinutes: 1 } })
    expect(await startImpersonation(short.deps, short.admin as never, ask())).toMatchObject({ maxMinutes: 5 })
    expect(short.signInCalls[0].ttlSeconds).toBe(300)
  })

  it('audits the start with the admin, the customer and the reason', async () => {
    const h = harness()
    await startImpersonation(h.deps, h.admin as never, ask())
    const started = h.audits.find((a) => a.action === 'impersonation.started')
    expect(started).toMatchObject({ adminId: 1, targetUserId: 2, ip: '203.0.113.9' })
    expect(started?.detail).toContain('Customer asked us to check a missing order')
  })
})

// --- Expiry and stopping -----------------------------------------------------

describe('expiry and stop', () => {
  it('the customer session stops working when its time runs out, and the admin keeps working', async () => {
    const h = harness({ settings: { maxMinutes: 5 } })
    const adminToken = (await loginAsUser(h.db, { id: 1, secret: SECRET })).token as string
    const started = (await startImpersonation(h.deps, h.admin as never, ask())) as { token: string }
    expect(await verifyAuth(h.db, { headers: tokenHeaders(started.token), secret: SECRET })).toMatchObject({ user: { id: 2 } })

    h.advance(299_000)
    expect(await verifyAuth(h.db, { headers: tokenHeaders(started.token), secret: SECRET })).toMatchObject({ user: { id: 2 } })
    h.advance(2_000)
    expect(await verifyAuth(h.db, { headers: tokenHeaders(started.token), secret: SECRET })).toEqual({ user: null })
    expect(await verifyAuth(h.db, { headers: tokenHeaders(adminToken), secret: SECRET })).toMatchObject({ user: { id: 1 } })
  })

  it('an impersonated session cannot be refreshed to live longer', async () => {
    const h = harness()
    const started = (await startImpersonation(h.deps, h.admin as never, ask())) as { token: string }
    await expect(refreshToken(h.db, { headers: tokenHeaders(started.token), secret: SECRET })).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('stop ends the impersonation, revokes the customer session, and leaves the admin session alone', async () => {
    const h = harness()
    const adminToken = (await loginAsUser(h.db, { id: 1, secret: SECRET })).token as string
    const started = (await startImpersonation(h.deps, h.admin as never, ask())) as { token: string }
    const stopped = await stopImpersonation(h.deps, 'imp-1', { ip: null, userAgent: null })
    expect(stopped).toMatchObject({ ok: true, ended: true })
    expect(h.impRows[0].endedAt).not.toBeNull()
    expect(await verifyAuth(h.db, { headers: tokenHeaders(started.token), secret: SECRET })).toEqual({ user: null })
    expect(await verifyAuth(h.db, { headers: tokenHeaders(adminToken), secret: SECRET })).toMatchObject({ user: { id: 1 } })
    expect(h.audits.map((a) => a.action)).toContain('impersonation.ended')
  })

  it('stop is safe to repeat, and audits only once', async () => {
    const h = harness()
    await startImpersonation(h.deps, h.admin as never, ask())
    await stopImpersonation(h.deps, 'imp-1', { ip: null, userAgent: null })
    const again = await stopImpersonation(h.deps, 'imp-1', { ip: null, userAgent: null })
    expect(again).toMatchObject({ ok: true, ended: false })
    expect(h.audits.filter((a) => a.action === 'impersonation.ended')).toHaveLength(1)
  })

  it('an expired row is refused by the device-session check even without the time claim', async () => {
    const h = harness({ settings: { maxMinutes: 5 } })
    await startImpersonation(h.deps, h.admin as never, ask())
    const row = h.impRows[0]
    h.advance(301_000)
    const check = await checkSession(h.sessions, { usid: row.sessionId as string, userId: 2 }, h.now())
    expect(check).toBe('expired')
  })
})

// --- Restricted actions ------------------------------------------------------

describe('restricted actions while impersonating', () => {
  const imp = 'engage-imp=eyJhbGciOiJIUzI1NiJ9.e30.sig'

  it('the single guard refuses when the impersonation cookie is present, and passes otherwise', () => {
    expect(refuseWhileImpersonating({ get: () => imp })).toBe(REFUSED_WHILE_IMPERSONATING)
    expect(refuseWhileImpersonating({ get: () => 'engage-token=x; other=1' })).toBeNull()
    expect(refuseWhileImpersonating({ get: () => null })).toBeNull()
  })

  it('fails closed: a malformed or empty impersonation cookie still refuses', () => {
    expect(isImpersonating({ get: () => 'engage-imp' })).toBe(true)
    expect(isImpersonating({ get: () => 'engage-imp=' })).toBe(true)
    expect(isImpersonating({ get: () => 'a=1; engage-imp=%%%' })).toBe(true)
    expect(isImpersonating({ get: () => 'engage-impx=1' })).toBe(false)
  })

  it('reads the cookie value, last occurrence wins, and swaps the customer token in for the account area', async () => {
    expect(cookieValue({ get: () => 'engage-imp=abc; engage-imp=def' }, IMPERSONATION_COOKIE)).toBe('def')
    const h = harness()
    const started = (await startImpersonation(h.deps, h.admin as never, ask())) as { token: string }
    const incoming = { get: (name: string) => (name === 'Cookie' ? `engage-token=ADMIN; ${IMPERSONATION_COOKIE}=${started.token}` : name === 'Authorization' ? 'Bearer x' : null) }
    const customerView = headersForCustomerView(incoming)
    expect(await verifyAuth(h.db, { headers: customerView, secret: SECRET })).toMatchObject({ user: { id: 2 } })
    expect(customerView.get('Authorization')).toBeNull()
  })

  // Each action is called for real, with the impersonation cookie present. The guard is the first
  // thing each one does, so the refusal must come back before any other work.
  it('changes to password, email and account linking are refused', async () => {
    cookieState.cookieHeader = imp
    const form = new FormData()
    const pass = await accountsActions.changePasswordAction({ status: 'idle' } as never, form)
    expect(pass).toMatchObject({ status: 'error', message: REFUSED_WHILE_IMPERSONATING })
    expect(await accountsActions.changeEmailAction({ status: 'idle' } as never, form)).toMatchObject({ status: 'error', message: REFUSED_WHILE_IMPERSONATING })
    expect(await accountsActions.confirmLinkAction({ status: 'idle' } as never, form)).toMatchObject({ status: 'error', message: REFUSED_WHILE_IMPERSONATING })
  })

  it('two-step sign-in changes are refused', async () => {
    cookieState.cookieHeader = imp
    for (const result of [
      await twoFactorActions.beginTwoFactorAction(),
      await twoFactorActions.confirmTwoFactorAction('123456'),
      await twoFactorActions.disableTwoFactorAction('x'),
      await twoFactorActions.regenerateBackupCodesAction('x'),
      await twoFactorActions.adminResetTwoFactorAction('cara@example.com'),
    ]) {
      expect(result).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
    }
  })

  it('session management is refused', async () => {
    cookieState.cookieHeader = imp
    expect(await userSessionActions.revokeSessionAction('any')).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
    expect(await userSessionActions.revokeOtherSessionsAction()).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
    expect(await userSessionActions.adminRevokeSessionAction('any')).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
    expect(await userSessionActions.adminRevokeAllSessionsAction('cara@example.com')).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
  })

  it('API key creation and revocation are refused', async () => {
    cookieState.cookieHeader = imp
    expect(await apiKeyActions.createMyApiKey({ name: 'x', scopes: ['read'] })).toMatchObject({ ok: false, error: REFUSED_WHILE_IMPERSONATING })
    expect(await apiKeyActions.revokeApiKeyAction(1)).toMatchObject({ ok: false, error: REFUSED_WHILE_IMPERSONATING })
  })

  it('connected sign-in accounts cannot be unlinked', async () => {
    cookieState.cookieHeader = imp
    expect(await socialActions.unlinkSocialAction('google')).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
  })

  it('passkey registration, rename and removal are refused', async () => {
    cookieState.cookieHeader = imp
    const req = (path: string) => new Request(`https://shop.example${path}`, { method: 'POST', headers: { cookie: imp, 'content-type': 'application/json' }, body: '{}' })
    for (const response of [
      await passkeyHttp.registerOptionsResponse(req('/api/passkeys/register/options')),
      await passkeyHttp.registerVerifyResponse(req('/api/passkeys/register/verify')),
      await passkeyHttp.renameResponse(req('/api/passkeys/rename')),
      await passkeyHttp.removeResponse(req('/api/passkeys/remove')),
    ]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ ok: false, message: REFUSED_WHILE_IMPERSONATING })
    }
  })

  it('placing and completing an order (PayPal create and capture) is refused', async () => {
    const req = new Request('https://shop.example/api/shop-paypal-create', { method: 'POST', headers: { cookie: imp }, body: '{}' })
    const created = await paypalCreateRoute.POST(req)
    expect(created.status).toBe(403)
    const captured = await paypalCaptureRoute.POST(new Request('https://shop.example/api/shop-paypal-capture', { method: 'POST', headers: { cookie: imp }, body: '{}' }))
    expect(captured.status).toBe(403)
  })
})

// --- History and the audit trail ----------------------------------------------

describe('history', () => {
  it('lists every impersonation, newest first, with a status that reflects the stop and the expiry', async () => {
    const h = harness({ settings: { maxMinutes: 5 } })
    await startImpersonation(h.deps, h.admin as never, ask({ reason: 'first reason here' }))
    h.advance(60_000)
    await startImpersonation(h.deps, h.admin as never, ask({ reason: 'second reason here' }))
    await stopImpersonation(h.deps, 'imp-2', { ip: null, userAgent: null })
    h.advance(10 * 60_000)
    await startImpersonation(h.deps, h.admin as never, ask({ reason: 'third reason here' }))
    const entries = await impersonationHistory(h.deps.store, h.now(), 50)
    expect(entries.map((e) => e.reason)).toEqual(['third reason here', 'second reason here', 'first reason here'])
    expect(entries.map((e) => e.status)).toEqual(['active', 'ended', 'expired'])
    expect(entries[0]).toMatchObject({ adminEmail: 'ana@example.com', targetEmail: 'cara@example.com' })
    expect(JSON.stringify(entries)).not.toContain('sessionId')
  })

  it('writes an audit row for each started, refused and ended event, with the admin in the entry', async () => {
    const h = harness()
    await startImpersonation(h.deps, h.admin as never, ask())
    await startImpersonation(h.deps, h.admin as never, ask({ targetEmail: 'ed@example.com' }))
    await stopImpersonation(h.deps, 'imp-1', { ip: null, userAgent: null })
    expect(h.audits.map((a) => a.action)).toEqual(['impersonation.started', 'impersonation.refused', 'impersonation.ended'])
    expect(h.audits.every((a) => a.adminId === 1)).toBe(true)
  })
})
