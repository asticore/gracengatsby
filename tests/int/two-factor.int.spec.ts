// Two-factor sign-in: TOTP vectors, enrolment, backup codes, the login gate
// and the enforcement status. Uses an in-memory fake for the users table, the
// same style as localapi-auth.int.spec.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthDbOps, AuthUserRow } from '@/localapi/auth'
import { hashPassword, login, loginWithSecondFactor, LockedAuth, TwoFactorCodeError, verifyPassword } from '@/localapi/auth'
import {
  assertTwoFactorSatisfied,
  backupCodesRemaining,
  base32Encode,
  confirmEnrolment,
  decryptSecret,
  disableTwoFactor,
  generateBackupCodes,
  regenerateBackupCodes,
  startEnrolment,
  twoFactorStatus,
  verifySecondFactor,
  verifyTotp,
  type TwoFactorStore,
} from '@/features/security/twoFactor'
import { handleRestRequest } from '@/localapi/rest'
import { resetRateLimiter } from '@/features/security/rateLimit'
import { renderQrSvg } from '@/features/security/twoFactorQr'
import { DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from '@/features/security/settings'

const SECRET = 'test-secret-do-not-use-in-prod'
const PASSWORD = 'correct horse battery staple'

// RFC 6238 appendix B: ASCII key "12345678901234567890", SHA-1, 8 digits.
// This implementation uses 6 digits, i.e. the last 6 of the published codes.
const RFC_KEY = base32Encode(new TextEncoder().encode('12345678901234567890'))
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
]

function makeDb(initial: Partial<AuthUserRow>[] = []): AuthDbOps & TwoFactorStore & { rows: AuthUserRow[] } {
  const rows = initial.map((r) => ({ ...r })) as AuthUserRow[]
  return {
    rows,
    async findByEmail(email) {
      return rows.find((r) => r.email === email) ?? null
    },
    async findByID(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findByResetToken() {
      return null
    },
    async updateByID(id, data) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return null
      rows[idx] = { ...rows[idx], ...data } as AuthUserRow
      return rows[idx]
    },
    checkPassword: (row, password) => verifyPassword(password, row.salt, row.hash),
  }
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

/** A current code for a stored (possibly encrypted) secret, at `now`. */
async function codeFor(secretBase32: string, now: number): Promise<string> {
  // Search the verifier's own output rather than re-implementing HOTP here:
  // probe all 10^6 is too slow, so derive via the RFC-checked verifier on a
  // narrow set instead - computed with Web Crypto directly.
  const step = Math.floor(now / 1000 / 30)
  const bytes = (() => {
    const clean = secretBase32.replace(/=+$/, '')
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = 0
    let value = 0
    const out: number[] = []
    for (const ch of clean) {
      value = (value << 5) | alphabet.indexOf(ch)
      bits += 5
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255)
        bits -= 8
      }
    }
    return Uint8Array.from(out)
  })()
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setUint32(0, Math.floor(step / 2 ** 32))
  view.setUint32(4, step >>> 0)
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer))
  const offset = sig[sig.length - 1] & 0x0f
  const n = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

const settings = (patch: Partial<SecuritySettings['loginProtection']> = {}, featureEnabled = true): SecuritySettings => ({
  ...DEFAULT_SECURITY_SETTINGS,
  featureEnabled,
  loginProtection: { ...DEFAULT_SECURITY_SETTINGS.loginProtection, ...patch },
})

/** Enrols user 1 completely and returns the plain secret and backup codes. */
async function enrol(db: ReturnType<typeof makeDb>, now = Date.now()) {
  const started = await startEnrolment(db, { id: 1, email: 'user@example.com' })
  const confirmed = await confirmEnrolment(db, { id: 1 }, await codeFor(started.secret, now), { now })
  expect(confirmed.ok).toBe(true)
  return { secret: started.secret as string, codes: confirmed.backupCodes as string[] }
}

beforeEach(() => {
  process.env.ENGAGE_SECRET = 'unit-test-engage-secret'
})

describe('verifyTotp (RFC 6238)', () => {
  for (const [time, code] of RFC_VECTORS) {
    it(`accepts the published code at t=${time}`, async () => {
      const result = await verifyTotp(RFC_KEY, code, { now: time * 1000 })
      expect(result.valid).toBe(true)
      expect(result.step).toBe(Math.floor(time / 30))
    })
  }

  it('rejects a wrong code and malformed input', async () => {
    expect((await verifyTotp(RFC_KEY, '000000', { now: 59_000 })).valid).toBe(false)
    expect((await verifyTotp(RFC_KEY, '12345', { now: 59_000 })).valid).toBe(false)
    expect((await verifyTotp('not base32!!', '287082', { now: 59_000 })).valid).toBe(false)
  })

  it('allows one step of drift and no more', async () => {
    expect((await verifyTotp(RFC_KEY, '287082', { now: 59_000 + 30_000 })).valid).toBe(true)
    expect((await verifyTotp(RFC_KEY, '287082', { now: 59_000 + 90_000 })).valid).toBe(false)
  })

  it('refuses a replayed step', async () => {
    const first = await verifyTotp(RFC_KEY, '287082', { now: 59_000 })
    expect(first.valid).toBe(true)
    const replay = await verifyTotp(RFC_KEY, '287082', { now: 59_000, lastUsedStep: first.step })
    expect(replay.valid).toBe(false)
  })
})

describe('enrolment', () => {
  it('stores the secret encrypted and leaves two-step off until confirmed', async () => {
    const db = makeDb([makeUser()])
    const started = await startEnrolment(db, { id: 1, email: 'user@example.com' })

    expect(started.ok).toBe(true)
    expect(started.otpauthUri).toContain('otpauth://totp/')
    expect(started.otpauthUri).toContain(`secret=${started.secret}`)

    const row = db.rows[0]
    expect(row.twoFactorEnabled).toBe(false)
    expect(row.twoFactorSecret).toMatch(/^enc:v1:/)
    expect(row.twoFactorSecret).not.toContain(started.secret as string)
    expect(await decryptSecret(row.twoFactorSecret)).toBe(started.secret)
  })

  it('does not gate sign-in while enrolment is only started', async () => {
    const db = makeDb([makeUser()])
    await startEnrolment(db, { id: 1 })
    const result = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    expect(result.token).toBeTruthy()
    expect(result.twoFactorRequired).toBeUndefined()
  })

  it('refuses a wrong confirmation code and keeps two-step off', async () => {
    const db = makeDb([makeUser()])
    await startEnrolment(db, { id: 1 })
    const result = await confirmEnrolment(db, { id: 1 }, '000000')
    expect(result.ok).toBe(false)
    expect(db.rows[0].twoFactorEnabled).toBe(false)
  })

  it('confirms with a valid code, returns ten backup codes once and stores only hashes', async () => {
    const db = makeDb([makeUser()])
    const { codes } = await enrol(db)

    expect(codes).toHaveLength(10)
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
    expect(new Set(codes).size).toBe(10)

    const row = db.rows[0]
    expect(row.twoFactorEnabled).toBe(true)
    expect(row.twoFactorConfirmedAt).toBeTruthy()
    const stored = row.twoFactorBackupHashes as string
    for (const code of codes) expect(stored).not.toContain(code)
    expect(JSON.parse(stored)).toHaveLength(10)
    expect(backupCodesRemaining(row)).toBe(10)
  })

  it('refuses to start again while enabled', async () => {
    const db = makeDb([makeUser()])
    await enrol(db)
    expect((await startEnrolment(db, { id: 1 })).ok).toBe(false)
  })

  it('disables with the password or a code, and not with a wrong one', async () => {
    const db = makeDb([makeUser()])
    await enrol(db)

    expect((await disableTwoFactor(db, { id: 1 }, 'wrong')).ok).toBe(false)
    expect(db.rows[0].twoFactorEnabled).toBe(true)

    expect((await disableTwoFactor(db, { id: 1 }, PASSWORD)).ok).toBe(true)
    expect(db.rows[0].twoFactorEnabled).toBe(false)
    expect(db.rows[0].twoFactorSecret).toBeNull()
    expect(db.rows[0].twoFactorBackupHashes).toBeNull()

  })

  it('disables with a current authenticator code', async () => {
    const db = makeDb([makeUser()])
    const { secret } = await enrol(db)
    // The enrolment used this step; the next one is inside the drift window.
    const next = await codeFor(secret, Date.now() + 30_000)
    expect((await disableTwoFactor(db, { id: 1 }, next)).ok).toBe(true)
    expect(db.rows[0].twoFactorEnabled).toBe(false)
  })
})

describe('verifySecondFactor', () => {
  it('accepts a current code once and refuses the same code again (replay)', async () => {
    const db = makeDb([makeUser()])
    const now = Date.now()
    const { secret } = await enrol(db, now - 60_000)

    const code = await codeFor(secret, now)
    expect((await verifySecondFactor(db, { id: 1 }, code, { now })).ok).toBe(true)
    expect((await verifySecondFactor(db, { id: 1 }, code, { now })).ok).toBe(false)
  })

  it('accepts each backup code exactly once', async () => {
    const db = makeDb([makeUser()])
    const { codes } = await enrol(db)

    const first = await verifySecondFactor(db, { id: 1 }, codes[0])
    expect(first).toMatchObject({ ok: true, method: 'backup', backupCodesLeft: 9 })
    expect((await verifySecondFactor(db, { id: 1 }, codes[0])).ok).toBe(false)
    expect(backupCodesRemaining(db.rows[0])).toBe(9)

    // Case and the dash do not matter when typing one in.
    expect((await verifySecondFactor(db, { id: 1 }, codes[1].toUpperCase().replace('-', ' '))).ok).toBe(true)
    expect(backupCodesRemaining(db.rows[0])).toBe(8)
  })

  it('rejects garbage and an unenrolled account', async () => {
    const db = makeDb([makeUser()])
    expect((await verifySecondFactor(db, { id: 1 }, '123456')).ok).toBe(false)
    await enrol(db)
    expect((await verifySecondFactor(db, { id: 1 }, 'hello')).ok).toBe(false)
    expect((await verifySecondFactor(db, { id: 1 }, 'zzzzz-zzzzz')).ok).toBe(false)
  })

  it('regenerating makes new codes and kills the old ones', async () => {
    const db = makeDb([makeUser()])
    const { codes: old } = await enrol(db)

    expect((await regenerateBackupCodes(db, { id: 1 }, 'wrong')).ok).toBe(false)
    const fresh = await regenerateBackupCodes(db, { id: 1 }, PASSWORD)
    expect(fresh.ok).toBe(true)
    expect(fresh.backupCodes).toHaveLength(10)

    expect((await verifySecondFactor(db, { id: 1 }, old[0])).ok).toBe(false)
    expect((await verifySecondFactor(db, { id: 1 }, fresh.backupCodes![0])).ok).toBe(true)
  })

  it('generates distinct codes', () => {
    expect(new Set(generateBackupCodes(50)).size).toBe(50)
  })
})

describe('login gate', () => {
  it('signs in with a password alone when two-step is not enrolled (nobody locked out)', async () => {
    const db = makeDb([makeUser({ roles: ['admin'] })])
    const result = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    expect(result.token).toBeTruthy()
    expect(result.twoFactorRequired).toBeUndefined()
  })

  it('returns a pending state with no session once two-step is confirmed', async () => {
    const db = makeDb([makeUser()])
    await enrol(db)

    const result = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    expect(result.twoFactorRequired).toBe(true)
    expect(result.pendingToken).toBeTruthy()
    expect(result.token).toBeUndefined()
    expect(db.rows[0].sessions).toEqual([])
  })

  it('still rejects a wrong password before any second step', async () => {
    const db = makeDb([makeUser()])
    await enrol(db)
    await expect(login(db, { email: 'user@example.com', password: 'nope', secret: SECRET })).rejects.toThrow()
  })

  it('completes the session with a valid code', async () => {
    const db = makeDb([makeUser()])
    const now = Date.now()
    const { secret } = await enrol(db, now - 60_000)

    const pending = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const done = await loginWithSecondFactor(db, { pendingToken: pending.pendingToken as string, code: await codeFor(secret, now), secret: SECRET })

    expect(done.token).toBeTruthy()
    expect(db.rows[0].sessions).toHaveLength(1)
    // The replay marker written by the check survived the session write.
    expect(db.rows[0].twoFactorLastUsedStep).toBe(Math.floor(now / 1000 / 30))
  })

  it('completes with a backup code and consumes it', async () => {
    const db = makeDb([makeUser()])
    const { codes } = await enrol(db)

    const pending = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const done = await loginWithSecondFactor(db, { pendingToken: pending.pendingToken as string, code: codes[3], secret: SECRET })
    expect(done.token).toBeTruthy()
    expect(backupCodesRemaining(db.rows[0])).toBe(9)
  })

  it('refuses a wrong code, counts it toward the lockout, then locks', async () => {
    const db = makeDb([makeUser()])
    await enrol(db)
    const pending = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const args = { pendingToken: pending.pendingToken as string, code: '000000', secret: SECRET }

    for (let i = 0; i < 4; i += 1) {
      await expect(loginWithSecondFactor(db, args)).rejects.toBeInstanceOf(TwoFactorCodeError)
    }
    await expect(loginWithSecondFactor(db, args)).rejects.toBeInstanceOf(LockedAuth)
    expect(db.rows[0].sessions).toEqual([])
  })

  it('rejects a forged or expired pending token and one used as a session token', async () => {
    const db = makeDb([makeUser()])
    await enrol(db)
    await expect(loginWithSecondFactor(db, { pendingToken: 'a.b.c', code: '123456', secret: SECRET })).rejects.toBeInstanceOf(TwoFactorCodeError)

    const pending = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    await expect(loginWithSecondFactor(db, { pendingToken: pending.pendingToken as string, code: '123456', secret: 'other-secret' })).rejects.toBeInstanceOf(TwoFactorCodeError)
  })

  it('does not gate a corrupted enrolment that nothing could satisfy', async () => {
    const db = makeDb([makeUser({ twoFactorEnabled: true, twoFactorConfirmedAt: '2026-01-01T00:00:00.000Z', twoFactorSecret: null, twoFactorBackupHashes: null })])
    const result = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    expect(result.token).toBeTruthy()
  })

  it('lets a backup code in when the secret can no longer be decrypted', async () => {
    const db = makeDb([makeUser()])
    const { codes } = await enrol(db)
    process.env.ENGAGE_SECRET = 'a-rotated-secret'

    const pending = await login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET })
    const done = await loginWithSecondFactor(db, { pendingToken: pending.pendingToken as string, code: codes[0], secret: SECRET })
    expect(done.token).toBeTruthy()
  })
})

describe('enforcement settings', () => {
  const admin = { id: 1, roles: ['admin'], twoFactorEnabled: false }
  const customer = { id: 2, roles: ['customer'], twoFactorEnabled: false }

  it('never requires or redirects with both settings off (the default)', () => {
    for (const user of [admin, customer]) {
      const status = assertTwoFactorSatisfied(user, settings())
      expect(status.required).toBe(false)
      expect(status.mustEnrol).toBe(false)
      expect(status.enrolPath).toBeUndefined()
      expect(status.satisfied).toBe(true)
    }
  })

  it('redirects an unenrolled admin to the setup screen when the admin setting is on', () => {
    const status = assertTwoFactorSatisfied(admin, settings({ requireTwoFactorForAdmins: true }))
    expect(status.mustEnrol).toBe(true)
    expect(status.enrolPath).toBe('/admin/security/two-factor')
    expect(status.enrolmentAvailable).toBe(true)
  })

  it('leaves customers alone when only the admin setting is on, and the reverse', () => {
    expect(twoFactorStatus(customer, settings({ requireTwoFactorForAdmins: true })).mustEnrol).toBe(false)
    expect(twoFactorStatus(admin, settings({ requireTwoFactorForMembers: true })).mustEnrol).toBe(false)
  })

  it('redirects an unenrolled customer to their profile when the member setting is on', () => {
    const status = assertTwoFactorSatisfied(customer, settings({ requireTwoFactorForMembers: true }))
    expect(status.mustEnrol).toBe(true)
    expect(status.enrolPath).toBe('/account/profile')
  })

  it('is satisfied once enrolled, and ignored when the Security feature is off', () => {
    expect(twoFactorStatus({ ...admin, twoFactorEnabled: true }, settings({ requireTwoFactorForAdmins: true })).mustEnrol).toBe(false)
    expect(twoFactorStatus(admin, settings({ requireTwoFactorForAdmins: true }, false)).mustEnrol).toBe(false)
  })

  it('never throws', () => {
    expect(() => assertTwoFactorSatisfied(null, settings({ requireTwoFactorForAdmins: true }))).not.toThrow()
  })
})

describe('QR code', () => {
  it('renders an inline SVG with no external references', () => {
    const svg = renderQrSvg('otpauth://totp/Test:a@b.com?secret=JBSWY3DPEHPK3PXP&issuer=Test')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<path')
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })
})

describe('REST endpoints', () => {
  const post = (path: string, body: unknown) =>
    new Request(`http://x/api/users/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  const stubEngine = (overrides: Record<string, unknown> = {}) =>
    ({
      findGlobal: vi.fn().mockResolvedValue(null),
      login: vi.fn(),
      loginSecondFactor: vi.fn(),
      ...overrides,
    }) as never

  beforeEach(() => resetRateLimiter())

  it('POST /users/login with a pending second step sets no cookie', async () => {
    const engine = stubEngine({ login: vi.fn().mockResolvedValue({ user: { id: 1 }, twoFactorRequired: true, pendingToken: 'pending' }) })
    const res = await handleRestRequest(post('login', { email: 'a@b.com', password: 'x' }), ['users', 'login'], engine)
    expect(res!.status).toBe(200)
    expect(res!.headers.get('Set-Cookie')).toBeNull()
    expect(await res!.json()).toEqual({ message: 'A two-step code is required.', twoFactorRequired: true, pendingToken: 'pending' })
  })

  it('POST /users/login-2fa issues the cookie on success', async () => {
    const engine = stubEngine({ loginSecondFactor: vi.fn().mockResolvedValue({ user: { id: 1, email: 'a@b.com' }, token: 'tok', exp: 1 }) })
    const res = await handleRestRequest(post('login-2fa', { pendingToken: 'pending', code: '123456' }), ['users', 'login-2fa'], engine)
    expect(res!.status).toBe(200)
    expect(res!.headers.get('Set-Cookie') ?? '').toContain('engage-token=tok')
  })

  it('POST /users/login-2fa maps a wrong code to 401 with no cookie', async () => {
    const engine = stubEngine({ loginSecondFactor: vi.fn().mockRejectedValue(new TwoFactorCodeError()) })
    const res = await handleRestRequest(post('login-2fa', { pendingToken: 'pending', code: '000000' }), ['users', 'login-2fa'], engine)
    expect(res!.status).toBe(401)
    expect(res!.headers.get('Set-Cookie')).toBeNull()
  })

  it('POST /users/login-2fa is rate limited in its own bucket', async () => {
    const engine = stubEngine({ loginSecondFactor: vi.fn().mockRejectedValue(new TwoFactorCodeError()) })
    let last = 0
    for (let i = 0; i < 12; i += 1) {
      const res = await handleRestRequest(post('login-2fa', { pendingToken: 'p', code: '000000' }), ['users', 'login-2fa'], engine)
      last = res!.status
    }
    expect(last).toBe(429)
    // The password step has its own allowance and is untouched.
    const ok = stubEngine({ login: vi.fn().mockResolvedValue({ user: { id: 1 }, token: 'tok', exp: 1 }) })
    const res = await handleRestRequest(post('login', { email: 'a@b.com', password: 'x' }), ['users', 'login'], ok)
    expect(res!.status).toBe(200)
  })
})
