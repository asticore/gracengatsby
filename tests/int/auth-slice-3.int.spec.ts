// Auth slice 3: two-step enforcement by role, emailed second-step codes, trusted devices and
// per-collection API key scopes. In-memory fakes throughout, in the style of two-factor.int.spec.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/security/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/security/settings')>()),
  readSecuritySettingsFromD1: vi.fn(),
}))

import {
  decideRoute,
  normalizeScope,
  scopableCollections,
  scopesAllow,
  validateScopes,
} from '@/features/apiKeys'
import { parseScopes } from '@/features/apiKeys/core'
import { buildScopes } from '@/features/apiKeys/scopePicker'
import { clientKey } from '@/features/security/rateLimit'
import {
  DEFAULT_SECURITY_SETTINGS,
  parseRoleList,
  readSecuritySettingsFromD1,
  rowToSettings,
  twoFactorFrom,
  type SecuritySettings,
} from '@/features/security/settings'
import {
  confirmEmailEnrolment,
  assertTwoFactorSatisfied,
  isEnrolled,
  startEnrolment,
  type TwoFactorRow,
  type TwoFactorStore,
} from '@/features/security/twoFactor'
import {
  ENFORCEMENT_OVERRIDE_ENV,
  evaluateEnforcement,
  isCovered,
  isEnrolmentSafeRoute,
  roleTokensOf,
} from '@/features/security/twoFactorEnforcement'
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_SENDS_PER_WINDOW,
  EMAIL_OTP_TTL_MS,
  sendEmailOtp,
  verifyEmailOtp,
  type EmailOtpDeps,
  type EmailOtpRow,
  type EmailOtpStore,
} from '@/features/security/twoFactorEmail'
import {
  TRUSTED_DEVICE_COOKIE,
  checkTrustedDevice,
  issueTrustedDevice,
  listTrustedDevices,
  parseTrustedToken,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
  trustedTokenFromCookieHeader,
  type TrustedDeviceRow,
  type TrustedDeviceStore,
} from '@/features/security/trustedDevices'
import type { AuthDbOps, AuthUserRow, EmailOtpOps, TrustedDeviceOps } from '@/localapi/auth'
import { hashPassword, login, loginAsUser, loginWithSecondFactor, resetPassword, sendSecondFactorEmail, TwoFactorCodeError } from '@/localapi/auth'
import { gateTwoFactorEnforcement } from '@/localapi/rest'

const SECRET = 'test-secret-do-not-use-in-prod'
const PASSWORD = 'correct horse battery staple'
const HOUR = 3_600_000

const withTwoFactor = (patch: Partial<SecuritySettings['twoFactor']> = {}, base: Partial<SecuritySettings> = {}): SecuritySettings => ({
  ...DEFAULT_SECURITY_SETTINGS,
  featureEnabled: true,
  ...base,
  twoFactor: { ...DEFAULT_SECURITY_SETTINGS.twoFactor, ...patch },
})

beforeEach(() => {
  process.env.ENGAGE_SECRET = 'unit-test-engage-secret'
  delete process.env[ENFORCEMENT_OVERRIDE_ENV]
})

// --- Settings ----------------------------------------------------------------

describe('two-step settings', () => {
  it('are all off by default', () => {
    expect(DEFAULT_SECURITY_SETTINGS.twoFactor).toEqual({
      requiredRoles: [],
      graceEndsAt: null,
      emailOtpEnabled: false,
      trustedDevicesEnabled: false,
      trustedDeviceDays: 30,
    })
  })

  it('reads the flat columns, cleaning the role list and clamping the days', () => {
    const row = {
      two_factor_required_roles: ' Admin, editor ;;custom-role,ADMIN, bad role!',
      two_factor_grace_ends_at: '2026-12-01T00:00:00.000Z',
      two_factor_email_otp_enabled: 1,
      trusted_devices_enabled: 1,
      trusted_device_days: 500,
    }
    expect(twoFactorFrom((key) => (row as Record<string, unknown>)[key])).toEqual({
      requiredRoles: ['admin', 'editor', 'custom-role', 'bad'],
      graceEndsAt: '2026-12-01T00:00:00.000Z',
      emailOtpEnabled: true,
      trustedDevicesEnabled: true,
      trustedDeviceDays: 90,
    })
    expect(rowToSettings(row, true).twoFactor.requiredRoles).toContain('editor')
  })

  it('treats a missing or garbled grace date as no grace period', () => {
    expect(twoFactorFrom(() => 'not a date').graceEndsAt).toBeNull()
    expect(twoFactorFrom(() => undefined).graceEndsAt).toBeNull()
    expect(parseRoleList(null)).toEqual([])
  })
})

// --- Enforcement ---------------------------------------------------------------

describe('enforcement by role', () => {
  const NOW = Date.parse('2026-11-22T12:00:00.000Z')
  const required = (roles: string[], patch: Partial<SecuritySettings['twoFactor']> = {}) => withTwoFactor({ requiredRoles: roles, ...patch })

  it('requires nothing with the defaults, and with the feature off', () => {
    expect(evaluateEnforcement({ roles: ['admin'] }, withTwoFactor()).state).toBe('off')
    expect(evaluateEnforcement({ roles: ['admin'] }, withTwoFactor({ requiredRoles: ['admin'] }, { featureEnabled: false })).state).toBe('off')
  })

  it('covers built-in roles, customers and custom role slugs, and only those', () => {
    const settings = required(['editor', 'customer', 'shop-staff'])
    expect(isCovered({ roles: ['editor'] }, settings)).toBe(true)
    expect(isCovered({ roles: ['customer'] }, settings)).toBe(true)
    expect(isCovered({ roles: ['viewer'], customRoleSlug: 'Shop-Staff' }, settings)).toBe(true)
    expect(isCovered({ roles: ['admin'] }, settings)).toBe(false)
    expect(isCovered({ roles: ['viewer'] }, settings)).toBe(false)
    expect(roleTokensOf({ roles: ['Editor'], customRoleSlug: 'X' })).toEqual(['editor', 'x'])
  })

  it('still honours the two older checkboxes', () => {
    const admins = withTwoFactor({}, { loginProtection: { ...DEFAULT_SECURITY_SETTINGS.loginProtection, requireTwoFactorForAdmins: true } })
    expect(evaluateEnforcement({ roles: ['admin'] }, admins).state).toBe('enforced')
    expect(evaluateEnforcement({ roles: ['customer'] }, admins).state).toBe('off')
  })

  it('is satisfied once enrolled, whatever the role', () => {
    const out = evaluateEnforcement({ roles: ['editor'], twoFactorEnabled: true }, required(['editor']))
    expect(out).toMatchObject({ required: true, enrolled: true, state: 'satisfied', reject: false })
  })

  it('only reminds during the grace period, then enforces', () => {
    const settings = required(['editor'], { graceEndsAt: new Date(NOW + HOUR).toISOString() })
    const during = evaluateEnforcement({ roles: ['editor'] }, settings, { now: NOW })
    expect(during).toMatchObject({ state: 'grace', reject: false, graceEndsAt: new Date(NOW + HOUR).toISOString() })
    expect(assertTwoFactorSatisfied({ roles: ['editor'] }, settings, { now: NOW })).toMatchObject({ mustEnrol: false, inGrace: true, satisfied: true })

    const after = evaluateEnforcement({ roles: ['editor'] }, settings, { now: NOW + 2 * HOUR })
    expect(after).toMatchObject({ state: 'enforced', reject: true })
  })

  it('sends the unenrolled to the right setup screen once enforced', () => {
    const settings = required(['editor', 'customer'])
    expect(assertTwoFactorSatisfied({ roles: ['editor'] }, settings)).toMatchObject({ mustEnrol: true, reject: true, enrolPath: '/admin/security/two-factor' })
    expect(assertTwoFactorSatisfied({ roles: ['customer'] }, settings)).toMatchObject({ mustEnrol: true, enrolPath: '/account/profile' })
  })

  it('is lifted by ENGAGE_DISABLE_2FA_ENFORCEMENT', () => {
    const settings = required(['admin'])
    const out = evaluateEnforcement({ roles: ['admin'] }, settings, { env: { [ENFORCEMENT_OVERRIDE_ENV]: 'true' } })
    expect(out).toMatchObject({ state: 'exempt', reject: false })
    expect(assertTwoFactorSatisfied({ roles: ['admin'] }, settings, { env: { [ENFORCEMENT_OVERRIDE_ENV]: '1' } }).mustEnrol).toBe(false)
    expect(evaluateEnforcement({ roles: ['admin'] }, settings, { env: { [ENFORCEMENT_OVERRIDE_ENV]: 'no' } }).state).toBe('enforced')
  })

  it('never refuses the API for the last administrator, but still sends them to set up', () => {
    const settings = required(['admin'])
    const sole = evaluateEnforcement({ roles: ['admin'] }, settings, { soleAdmin: true })
    expect(sole).toMatchObject({ state: 'enforced', reject: false })
    expect(assertTwoFactorSatisfied({ roles: ['admin'] }, settings, { soleAdmin: true }).mustEnrol).toBe(true)
    expect(evaluateEnforcement({ roles: ['admin'] }, settings, { soleAdmin: false }).reject).toBe(true)
    // The sole-admin exemption is for admins only.
    expect(evaluateEnforcement({ roles: ['editor'] }, required(['editor']), { soleAdmin: true }).reject).toBe(true)
  })

  it('keeps sign-out, session lookup and the sign-in steps reachable', () => {
    for (const route of ['me', 'logout', 'login', 'login-2fa', 'refresh-token']) expect(isEnrolmentSafeRoute(['users', route])).toBe(true)
    expect(isEnrolmentSafeRoute(['pages'])).toBe(false)
    expect(isEnrolmentSafeRoute(['users', '5'])).toBe(false)
    expect(isEnrolmentSafeRoute(['orders', 'logout'])).toBe(false)
  })
})

describe('REST enforcement gate', () => {
  const request = (path: string) => new Request(`http://x/api/${path}`, { headers: { cookie: 'engage-token=t' } })
  const engineFor = (user: unknown, admins: Array<{ roles: string[] }> = []) =>
    ({
      auth: vi.fn().mockResolvedValue({ user }),
      find: vi.fn().mockResolvedValue({ docs: admins }),
    }) as never

  const configure = (settings: SecuritySettings) => vi.mocked(readSecuritySettingsFromD1).mockResolvedValue(settings)

  it('does nothing when no role is required', async () => {
    configure(withTwoFactor())
    expect(await gateTwoFactorEnforcement(engineFor({ id: 1, roles: ['editor'] }), request('pages'), ['pages'])).toBeNull()
  })

  it('refuses an unenrolled covered user with 403 and the setup path', async () => {
    configure(withTwoFactor({ requiredRoles: ['editor'] }))
    const res = await gateTwoFactorEnforcement(engineFor({ id: 2, roles: ['editor'] }), request('pages'), ['pages'])
    expect(res!.status).toBe(403)
    const body = (await res!.json()) as { errors: Array<{ name: string; enrolPath: string }> }
    expect(body.errors[0]).toMatchObject({ name: 'TwoFactorRequired', enrolPath: '/admin/security/two-factor' })
  })

  it('lets an enrolled user, a user in grace, and the enrolment-safe routes through', async () => {
    configure(withTwoFactor({ requiredRoles: ['editor'] }))
    expect(await gateTwoFactorEnforcement(engineFor({ id: 2, roles: ['editor'], twoFactorEnabled: true }), request('pages'), ['pages'])).toBeNull()
    expect(await gateTwoFactorEnforcement(engineFor({ id: 2, roles: ['editor'] }), request('users/logout'), ['users', 'logout'])).toBeNull()
    configure(withTwoFactor({ requiredRoles: ['editor'], graceEndsAt: new Date(Date.now() + HOUR).toISOString() }))
    expect(await gateTwoFactorEnforcement(engineFor({ id: 2, roles: ['editor'] }), request('pages'), ['pages'])).toBeNull()
  })

  it('matches a custom role slug the session user carries', async () => {
    configure(withTwoFactor({ requiredRoles: ['shop-staff'] }))
    const res = await gateTwoFactorEnforcement(engineFor({ id: 3, roles: ['viewer'], customRoleSlug: 'shop-staff' }), request('orders'), ['orders'])
    expect(res!.status).toBe(403)
  })

  it('does not refuse the only administrator, but does refuse one of several', async () => {
    configure(withTwoFactor({ requiredRoles: ['admin'] }))
    const admin = { id: 1, roles: ['admin'] }
    expect(await gateTwoFactorEnforcement(engineFor(admin, [{ roles: ['admin'] }, { roles: ['customer'] }]), request('pages'), ['pages'])).toBeNull()
    const res = await gateTwoFactorEnforcement(engineFor(admin, [{ roles: ['admin'] }, { roles: ['admin'] }]), request('pages'), ['pages'])
    expect(res!.status).toBe(403)
  })

  it('fails open when the settings cannot be read', async () => {
    vi.mocked(readSecuritySettingsFromD1).mockRejectedValue(new Error('d1 down'))
    expect(await gateTwoFactorEnforcement(engineFor({ id: 2, roles: ['editor'] }), request('pages'), ['pages'])).toBeNull()
  })
})

// --- Email codes ---------------------------------------------------------------

function memoryEmailStore(): EmailOtpStore & { rows: EmailOtpRow[] } {
  const rows: EmailOtpRow[] = []
  let next = 1
  return {
    rows,
    async insert(row) {
      rows.push({ ...row, id: next++, attempts: 0, usedAt: null })
    },
    async invalidateOpen(userId, purpose, at) {
      for (const row of rows) if (row.userId === userId && row.purpose === purpose && !row.usedAt) row.usedAt = at
    },
    async findLatestOpen(userId, purpose) {
      return [...rows].reverse().find((row) => row.userId === userId && row.purpose === purpose && !row.usedAt) ?? null
    },
    async setAttempts(id, attempts) {
      const row = rows.find((r) => r.id === id)
      if (row) row.attempts = attempts
    },
    async consume(id, at) {
      const row = rows.find((r) => r.id === id)
      if (!row || row.usedAt) return false
      row.usedAt = at
      return true
    },
  }
}

function emailHarness(overrides: Partial<EmailOtpDeps> = {}) {
  const store = memoryEmailStore()
  const sent: Array<{ to: string; code: string; minutes: number }> = []
  let clock = Date.parse('2026-11-22T12:00:00.000Z')
  let sends = 0
  const deps: EmailOtpDeps = {
    store,
    mail: async (to, code, minutes) => {
      sent.push({ to, code, minutes })
    },
    limiter: async () => ({ limited: ++sends > EMAIL_OTP_SENDS_PER_WINDOW }),
    now: () => clock,
    ...overrides,
  }
  return { deps, store, sent, advance: (ms: number) => (clock += ms), resetSends: () => (sends = 0) }
}

describe('emailed second-step code', () => {
  it('sends six digits, valid for 10 minutes, stored only as a salted hash', async () => {
    const h = emailHarness()
    const result = await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    expect(result.ok).toBe(true)
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ to: 'a@example.com', minutes: 10 })
    expect(h.sent[0].code).toMatch(/^\d{6}$/)

    const row = h.store.rows[0]
    expect(row.codeHash).not.toContain(h.sent[0].code)
    expect(row.codeHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(Date.parse(row.expiresAt) - Date.parse(row.createdAt)).toBe(EMAIL_OTP_TTL_MS)
  })

  it('accepts the right code once and refuses it again', async () => {
    const h = emailHarness()
    await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    const code = h.sent[0].code
    expect(await verifyEmailOtp(h.deps, 7, code, 'login')).toBe(true)
    expect(await verifyEmailOtp(h.deps, 7, code, 'login')).toBe(false)
  })

  it('refuses a code after 10 minutes', async () => {
    const h = emailHarness()
    await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    h.advance(EMAIL_OTP_TTL_MS + 1000)
    expect(await verifyEmailOtp(h.deps, 7, h.sent[0].code, 'login')).toBe(false)
  })

  it('kills the code after five wrong tries, even for the right code afterwards', async () => {
    const h = emailHarness()
    await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    const real = h.sent[0].code
    const wrong = real === '000000' ? '111111' : '000000'
    for (let i = 0; i < EMAIL_OTP_MAX_ATTEMPTS; i += 1) expect(await verifyEmailOtp(h.deps, 7, wrong, 'login')).toBe(false)
    expect(h.store.rows[0].attempts).toBe(EMAIL_OTP_MAX_ATTEMPTS)
    expect(await verifyEmailOtp(h.deps, 7, real, 'login')).toBe(false)
  })

  it('refuses malformed input and another account or purpose', async () => {
    const h = emailHarness()
    await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    const code = h.sent[0].code
    expect(await verifyEmailOtp(h.deps, 7, '12345', 'login')).toBe(false)
    expect(await verifyEmailOtp(h.deps, 7, 'abcdef', 'login')).toBe(false)
    expect(await verifyEmailOtp(h.deps, 8, code, 'login')).toBe(false)
    expect(await verifyEmailOtp(h.deps, 7, code, 'enrol')).toBe(false)
    expect(await verifyEmailOtp(h.deps, 7, code, 'login')).toBe(true)
  })

  it('a new code ends the old one', async () => {
    const h = emailHarness()
    await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    expect(await verifyEmailOtp(h.deps, 7, h.sent[0].code, 'login')).toBe(false)
    expect(await verifyEmailOtp(h.deps, 7, h.sent[1].code, 'login')).toBe(true)
  })

  it('rate limits sends per account through the limiter', async () => {
    const h = emailHarness()
    for (let i = 0; i < EMAIL_OTP_SENDS_PER_WINDOW; i += 1) {
      expect((await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })).ok).toBe(true)
    }
    const blocked = await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    expect(blocked.ok).toBe(false)
    expect(h.sent).toHaveLength(EMAIL_OTP_SENDS_PER_WINDOW)
  })

  it('ends the code when the email cannot be sent', async () => {
    const h = emailHarness({ mail: async () => Promise.reject(new Error('smtp down')) })
    const result = await sendEmailOtp(h.deps, { userId: 7, email: 'a@example.com', purpose: 'login' })
    expect(result.ok).toBe(false)
    expect(h.store.rows.every((row) => row.usedAt)).toBe(true)
  })
})

// --- Email enrolment and sign-in -----------------------------------------------

function makeDb(initial: Partial<AuthUserRow>[] = []) {
  const rows = initial.map((r) => ({ ...r })) as AuthUserRow[]
  const db: AuthDbOps & TwoFactorStore & { rows: AuthUserRow[] } = {
    rows,
    async findByEmail(email) {
      return rows.find((r) => r.email === email) ?? null
    },
    async findByID(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findByResetToken(token) {
      return rows.find((r) => r.resetPasswordToken === token) ?? null
    },
    async updateByID(id, data) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return null
      rows[idx] = { ...rows[idx], ...data } as AuthUserRow
      return rows[idx]
    },
  }
  return db
}

function makeUser(overrides: Partial<AuthUserRow> = {}): Partial<AuthUserRow> {
  const { salt, hash } = hashPassword(PASSWORD)
  return {
    id: 1,
    email: 'user@example.com',
    roles: ['customer'],
    salt,
    hash,
    loginAttempts: 0,
    lockUntil: null,
    sessions: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('email enrolment', () => {
  it('switches two-step on with backup codes and no authenticator secret, once the code checks out', async () => {
    const db = makeDb([makeUser()])
    const result = await confirmEmailEnrolment(db, { id: 1 }, async () => true)
    expect(result.ok).toBe(true)
    expect(result.backupCodes).toHaveLength(10)
    expect(db.rows[0].twoFactorSecret).toBeNull()
    expect(isEnrolled(db.rows[0] as TwoFactorRow)).toBe(true)
    expect(db.rows[0].twoFactorBackupHashes).not.toContain(result.backupCodes![0])
  })

  it('refuses a wrong code and leaves the account alone', async () => {
    const db = makeDb([makeUser()])
    const result = await confirmEmailEnrolment(db, { id: 1 }, async () => false)
    expect(result.ok).toBe(false)
    expect(isEnrolled(db.rows[0] as TwoFactorRow)).toBe(false)
  })

  it('refuses an account that is already enrolled, without spending the code', async () => {
    const db = makeDb([makeUser()])
    await confirmEmailEnrolment(db, { id: 1 }, async () => true)
    const check = vi.fn().mockResolvedValue(true)
    expect((await confirmEmailEnrolment(db, { id: 1 }, check)).ok).toBe(false)
    expect(check).not.toHaveBeenCalled()
    expect((await startEnrolment(db, { id: 1 })).ok).toBe(false)
  })
})

function emailOps(code: string | null = '123456'): EmailOtpOps & { sent: number } {
  const ops = {
    sent: 0,
    verify: async (_userId: number, given: string) => code !== null && given === code,
    send: async () => {
      ops.sent += 1
      return { ok: true, message: 'sent' }
    },
  }
  return ops
}

async function enrolledByEmail(db: ReturnType<typeof makeDb>) {
  return (await confirmEmailEnrolment(db, { id: 1 }, async () => true)).backupCodes as string[]
}

describe('email as the second step at sign-in', () => {
  it('completes the sign-in with the emailed code and refuses a wrong one', async () => {
    const db = makeDb([makeUser()])
    await enrolledByEmail(db)
    db.emailOtp = emailOps('123456')

    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    expect(first.twoFactorRequired).toBe(true)

    await expect(loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: '999999', method: 'email', secret: SECRET })).rejects.toBeInstanceOf(TwoFactorCodeError)
    const done = await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: '123456', method: 'email', secret: SECRET })
    expect(done.token).toBeTruthy()
  })

  it('does not let an emailed-code check stand in when the method is not email', async () => {
    const db = makeDb([makeUser()])
    await enrolledByEmail(db)
    db.emailOtp = emailOps('123456')
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    await expect(loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: '123456', secret: SECRET })).rejects.toBeInstanceOf(TwoFactorCodeError)
  })

  it('refuses the email method when it is not wired, and still accepts a backup code', async () => {
    const db = makeDb([makeUser()])
    const codes = await enrolledByEmail(db)
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    await expect(loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: '123456', method: 'email', secret: SECRET })).rejects.toBeInstanceOf(TwoFactorCodeError)
    const done = await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: codes[0], secret: SECRET })
    expect(done.token).toBeTruthy()
  })

  it('emails a code only for a genuine pending token', async () => {
    const db = makeDb([makeUser()])
    await enrolledByEmail(db)
    const ops = emailOps()
    db.emailOtp = ops
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })

    expect(await sendSecondFactorEmail(db, { pendingToken: first.pendingToken!, secret: SECRET })).toMatchObject({ ok: true })
    expect(ops.sent).toBe(1)
    await expect(sendSecondFactorEmail(db, { pendingToken: 'forged', secret: SECRET })).rejects.toBeInstanceOf(TwoFactorCodeError)
    expect(ops.sent).toBe(1)
  })

  it('does not email an account that has no second step', async () => {
    const db = makeDb([makeUser()])
    const ops = emailOps()
    db.emailOtp = ops
    const forged = (await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })).token
    expect(forged).toBeTruthy()
    await expect(sendSecondFactorEmail(db, { pendingToken: forged!, secret: SECRET })).rejects.toBeInstanceOf(TwoFactorCodeError)
  })
})

// --- Trusted devices -----------------------------------------------------------

function memoryDeviceStore(): TrustedDeviceStore & { rows: TrustedDeviceRow[] } {
  const rows: TrustedDeviceRow[] = []
  return {
    rows,
    async insert(row) {
      rows.push({ ...row })
    },
    async findByID(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async listActiveForUser(userId, nowIso) {
      return rows.filter((r) => r.userId === userId && !r.revokedAt && r.expiresAt > nowIso)
    },
    async touch(id, at) {
      const row = rows.find((r) => r.id === id)
      if (row) row.lastUsedAt = at
    },
    async revoke(id, userId, at) {
      const row = rows.find((r) => r.id === id && r.userId === userId && !r.revokedAt)
      if (!row) return false
      row.revokedAt = at
      return true
    },
    async revokeForUser(userId, at) {
      let n = 0
      for (const row of rows) if (row.userId === userId && !row.revokedAt) ((row.revokedAt = at), (n += 1))
      return n
    },
  }
}

describe('trusted devices', () => {
  const NOW = Date.parse('2026-11-22T12:00:00.000Z')
  const client = { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', ip: '203.0.113.77' }

  it('issues a signed cookie and stores only the hash, a label and a coarse address', async () => {
    const store = memoryDeviceStore()
    const issued = await issueTrustedDevice(store, { userId: 1, days: 30, secret: SECRET, client, now: NOW })
    expect(parseTrustedToken(issued.token)).not.toBeNull()
    expect(issued.maxAgeSeconds).toBe(30 * 86_400)

    const row = store.rows[0]
    const secretPart = issued.token.split('.')[1]
    expect(JSON.stringify(row)).not.toContain(secretPart)
    expect(row).toMatchObject({ userId: 1, label: 'Chrome on Windows', ip: '203.0.113.0', revokedAt: null })
    expect(Date.parse(row.expiresAt)).toBe(NOW + 30 * 86_400_000)
  })

  it('recognises its own cookie for the same account only', async () => {
    const store = memoryDeviceStore()
    const { token } = await issueTrustedDevice(store, { userId: 1, days: 30, secret: SECRET, client, now: NOW })
    expect(await checkTrustedDevice(store, { token, userId: 1, secret: SECRET, now: NOW + HOUR })).toBe(true)
    expect(await checkTrustedDevice(store, { token, userId: 2, secret: SECRET, now: NOW + HOUR })).toBe(false)
  })

  it('refuses a forged, edited, wrong-secret, expired or missing cookie', async () => {
    const store = memoryDeviceStore()
    const { token } = await issueTrustedDevice(store, { userId: 1, days: 1, secret: SECRET, client, now: NOW })
    const [id, secretPart, signature] = token.split('.')
    const flip = (hex: string) => (hex[0] === 'a' ? 'b' : 'a') + hex.slice(1)

    expect(await checkTrustedDevice(store, { token: `${id}.${flip(secretPart)}.${signature}`, userId: 1, secret: SECRET, now: NOW })).toBe(false)
    expect(await checkTrustedDevice(store, { token: `${id}.${secretPart}.${flip(signature)}`, userId: 1, secret: SECRET, now: NOW })).toBe(false)
    expect(await checkTrustedDevice(store, { token, userId: 1, secret: 'another-secret', now: NOW })).toBe(false)
    expect(await checkTrustedDevice(store, { token, userId: 1, secret: SECRET, now: NOW + 2 * 86_400_000 })).toBe(false)
    expect(await checkTrustedDevice(store, { token: 'nonsense', userId: 1, secret: SECRET, now: NOW })).toBe(false)
    expect(await checkTrustedDevice(store, { token: null, userId: 1, secret: SECRET, now: NOW })).toBe(false)

    // A row whose stored hash no longer matches (a swapped secret) is refused even with a good signature.
    store.rows[0].tokenHash = '0'.repeat(64)
    expect(await checkTrustedDevice(store, { token, userId: 1, secret: SECRET, now: NOW })).toBe(false)
  })

  it('can be listed and revoked one at a time, and only by its owner', async () => {
    const store = memoryDeviceStore()
    const a = await issueTrustedDevice(store, { userId: 1, days: 30, secret: SECRET, client, now: NOW })
    await issueTrustedDevice(store, { userId: 1, days: 30, secret: SECRET, client, now: NOW + 1000 })
    expect(await listTrustedDevices(store, 1, NOW + HOUR)).toHaveLength(2)

    expect(await revokeTrustedDevice(store, 2, a.id, NOW + HOUR)).toBe(false)
    expect(await revokeTrustedDevice(store, 1, a.id, NOW + HOUR)).toBe(true)
    expect(await checkTrustedDevice(store, { token: a.token, userId: 1, secret: SECRET, now: NOW + HOUR })).toBe(false)
    expect(await listTrustedDevices(store, 1, NOW + HOUR)).toHaveLength(1)
  })

  it('revokeAll ends every device and swallows store failures', async () => {
    const store = memoryDeviceStore()
    await issueTrustedDevice(store, { userId: 1, days: 30, secret: SECRET, client, now: NOW })
    await issueTrustedDevice(store, { userId: 1, days: 30, secret: SECRET, client, now: NOW })
    expect(await revokeAllTrustedDevices(store, 1, NOW)).toBe(2)
    expect(await listTrustedDevices(store, 1, NOW)).toHaveLength(0)

    const broken = { ...store, revokeForUser: async () => Promise.reject(new Error('db down')) }
    expect(await revokeAllTrustedDevices(broken, 1)).toBe(0)
  })

  it('reads the cookie out of a Cookie header', () => {
    expect(trustedTokenFromCookieHeader(`a=1; ${TRUSTED_DEVICE_COOKIE}=tok.en; b=2`)).toBe('tok.en')
    expect(trustedTokenFromCookieHeader('a=1')).toBeNull()
    expect(trustedTokenFromCookieHeader(null)).toBeNull()
  })
})

function deviceOps(store: TrustedDeviceStore, on = true): TrustedDeviceOps {
  return {
    check: async (token, userId, secret) => on && (await checkTrustedDevice(store, { token, userId, secret })),
    issue: async (userId, client, secret) => {
      if (!on) return null
      const issued = await issueTrustedDevice(store, { userId, days: 14, secret, client: client ?? undefined })
      return { token: issued.token, maxAgeSeconds: issued.maxAgeSeconds }
    },
    revokeAll: async (userId) => {
      await revokeAllTrustedDevices(store, userId)
    },
  }
}

describe('trusted devices at sign-in', () => {
  async function enrolledDb() {
    const db = makeDb([makeUser()])
    const codes = await enrolledByEmail(db)
    const store = memoryDeviceStore()
    db.trustedDevices = deviceOps(store)
    return { db, codes, store }
  }

  it('hands back a device cookie after a second step with "remember" ticked, and not otherwise', async () => {
    const { db, codes } = await enrolledDb()
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const without = await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: codes[0], secret: SECRET, client: { trustDevice: false } })
    expect(without.trustedDevice).toBeUndefined()

    const second = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const withTrust = await loginWithSecondFactor(db, { pendingToken: second.pendingToken!, code: codes[1], secret: SECRET, client: { trustDevice: true } })
    expect(withTrust.trustedDevice?.token).toBeTruthy()
    expect(withTrust.trustedDevice?.maxAgeSeconds).toBe(14 * 86_400)
  })

  it('skips the code on a remembered device but still checks the password', async () => {
    const { db, codes } = await enrolledDb()
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const done = await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: codes[0], secret: SECRET, client: { trustDevice: true } })
    const cookie = done.trustedDevice!.token

    const next = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET, client: { trustedDeviceToken: cookie } })
    expect(next.twoFactorRequired).toBeUndefined()
    expect(next.token).toBeTruthy()

    await expect(login(db, { email: 'user@example.com', password: 'wrong password', secret: SECRET, client: { trustedDeviceToken: cookie } })).rejects.toThrow()
    const viaAccount = await loginAsUser(db, { id: 1, secret: SECRET, client: { trustedDeviceToken: cookie } })
    expect(viaAccount.token).toBeTruthy()
  })

  it('asks for the code again for a revoked, foreign or garbage cookie', async () => {
    const { db, codes, store } = await enrolledDb()
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const cookie = (await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: codes[0], secret: SECRET, client: { trustDevice: true } })).trustedDevice!.token

    expect((await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET, client: { trustedDeviceToken: 'garbage' } })).twoFactorRequired).toBe(true)
    await revokeAllTrustedDevices(store, 1)
    expect((await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET, client: { trustedDeviceToken: cookie } })).twoFactorRequired).toBe(true)
  })

  it('asks for the code when the feature is switched off, even with a valid cookie', async () => {
    const { db, codes, store } = await enrolledDb()
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const cookie = (await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: codes[0], secret: SECRET, client: { trustDevice: true } })).trustedDevice!.token
    db.trustedDevices = deviceOps(store, false)
    expect((await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET, client: { trustedDeviceToken: cookie } })).twoFactorRequired).toBe(true)
  })

  it('forgets every device when the password is reset', async () => {
    const { db, codes, store } = await enrolledDb()
    const first = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    await loginWithSecondFactor(db, { pendingToken: first.pendingToken!, code: codes[0], secret: SECRET, client: { trustDevice: true } })
    expect(await listTrustedDevices(store, 1)).toHaveLength(1)

    db.rows[0] = { ...db.rows[0], resetPasswordToken: 'reset-token', resetPasswordExpiration: new Date(Date.now() + HOUR).toISOString() } as AuthUserRow
    await resetPassword(db, { token: 'reset-token', password: 'a brand new password', secret: SECRET })
    expect(await listTrustedDevices(store, 1)).toHaveLength(0)
  })
})

// --- API key scopes ------------------------------------------------------------

describe('API key scopes', () => {
  it('accepts collection:action, wildcards and the two legacy words, and nothing else', () => {
    for (const scope of ['pages:read', 'orders:write', 'blog-posts:*', '*:read', '*:*', '*', 'READ', 'Pages:Read']) {
      expect(normalizeScope(scope), scope).not.toBeNull()
    }
    for (const scope of ['pages', 'pages:delete', ':read', 'pa ges:read', 'pages:read:extra', '', 'admin', 5, null]) {
      expect(normalizeScope(scope as never), String(scope)).toBeNull()
    }
    expect(normalizeScope('read')).toBe('*:read')
    expect(normalizeScope('write')).toBe('*:write')
    expect(normalizeScope('*')).toBe('*:*')
  })

  it('validates a picked list: normalised, de-duplicated, bounded', () => {
    expect(validateScopes(['pages:read', 'Pages:Read', 'orders:write'])).toEqual({ ok: true, value: ['pages:read', 'orders:write'] })
    expect(validateScopes(['read', 'write'])).toEqual({ ok: true, value: ['read', 'write'] })
    expect(validateScopes(['*'])).toEqual({ ok: true, value: ['*:*'] })
    expect(validateScopes([]).ok).toBe(false)
    expect(validateScopes(['pages:read', 'bogus']).ok).toBe(false)
    expect(validateScopes(Array.from({ length: 51 }, (_, i) => `c${i}:read`)).ok).toBe(false)
  })

  it('reads stored lists, keeping the legacy words as written and dropping junk', () => {
    expect(parseScopes('["read","write"]')).toEqual(['read', 'write'])
    expect(parseScopes('["pages:read","nonsense",7,"pages:read"]')).toEqual(['pages:read'])
    expect(parseScopes('not json')).toEqual([])
    expect(parseScopes(null)).toEqual([])
  })

  it('maps the old read and write onto every collection', () => {
    expect(scopesAllow(['read'], 'pages', 'read')).toBe(true)
    expect(scopesAllow(['read'], 'pages', 'write')).toBe(false)
    expect(scopesAllow(['write'], 'orders', 'write')).toBe(true)
    expect(scopesAllow(['write'], 'orders', 'read')).toBe(false)
    expect(decideRoute(['read'], 'GET', ['anything'])).toEqual({ ok: true })
    expect(decideRoute(['write'], 'PATCH', ['anything', '3'])).toEqual({ ok: true })
  })

  it('limits a key to the collection and action it was given', () => {
    const scopes = ['pages:read', 'orders:write']
    expect(decideRoute(scopes, 'GET', ['pages'])).toEqual({ ok: true })
    expect(decideRoute(scopes, 'GET', ['pages', '4'])).toEqual({ ok: true })
    expect(decideRoute(scopes, 'POST', ['orders'])).toEqual({ ok: true })
    expect(decideRoute(scopes, 'PATCH', ['orders', '9'])).toEqual({ ok: true })
    expect(decideRoute(scopes, 'GET', ['orders'])).toMatchObject({ ok: false, status: 403, message: expect.stringContaining('orders:read') })
    expect(decideRoute(scopes, 'POST', ['pages'])).toMatchObject({ ok: false, status: 403, message: expect.stringContaining('pages:write') })
    expect(decideRoute(scopes, 'GET', ['products'])).toMatchObject({ ok: false, status: 403 })
  })

  it('treats * and *:* as every collection, read and write, but never delete', () => {
    for (const scopes of [['*'], ['*:*']]) {
      expect(decideRoute(scopes, 'GET', ['pages'])).toEqual({ ok: true })
      expect(decideRoute(scopes, 'POST', ['products'])).toEqual({ ok: true })
      expect(decideRoute(scopes, 'DELETE', ['pages', '1'])).toMatchObject({ ok: false, status: 403 })
    }
    expect(decideRoute(['pages:*'], 'POST', ['pages'])).toEqual({ ok: true })
    expect(decideRoute(['pages:*'], 'GET', ['orders'])).toMatchObject({ ok: false })
  })

  it('keeps the deny list ahead of any scope, including *', () => {
    for (const slug of [['users'], ['api-keys'], ['globals', 'security-settings'], ['pages', 'login'], ['pages', 'two-factor']]) {
      expect(decideRoute(['*'], 'GET', slug).ok, slug.join('/')).toBe(false)
    }
    expect(decideRoute(['users:read'], 'GET', ['users']).ok).toBe(false)
  })

  it('offers the picker only collections a key could be let into', () => {
    const list = scopableCollections([
      { slug: 'users', labels: { plural: 'Users' } },
      { slug: 'api-keys' },
      { slug: 'pages', labels: { plural: 'Pages' } },
      { slug: 'orders', labels: { plural: 'Orders' } },
      { slug: 'pages', labels: { plural: 'Dup' } },
      { slug: 'Bad Slug' },
      { slug: 'media' },
    ])
    expect(list.map((c) => c.slug)).toEqual(['media', 'orders', 'pages'])
    expect(list.find((c) => c.slug === 'media')?.label).toBe('media')
  })

  it('builds picker output the server accepts', () => {
    expect(buildScopes('all', {})).toEqual(['*'])
    expect(buildScopes('read-all', {})).toEqual(['*:read'])
    const custom = buildScopes('custom', { pages: { read: true, write: false }, orders: { read: true, write: true }, blog: { read: false, write: false } })
    expect(custom).toEqual(['orders:read', 'orders:write', 'pages:read'])
    expect(validateScopes(custom).ok).toBe(true)
    expect(buildScopes('custom', {})).toEqual([])
  })
})

describe('client key', () => {
  it('is untouched by this slice', () => {
    expect(clientKey(new Request('http://x/', { headers: { 'cf-connecting-ip': '198.51.100.1' } }))).toBe('198.51.100.1')
  })
})
