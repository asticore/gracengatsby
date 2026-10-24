// @vitest-environment node
// Configurable password policy: defaults, each rule, the common list, the breach
// check (k-anonymity, fail open), history, the maximum age, and the fresh-install
// path that must still create the first admin.
import { createHash } from 'crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'

// The store reaches the database through the app's D1 resolver. In tests that
// resolver would open a second wrangler proxy with a different database, so it is
// pointed at this spec's migrated D1 instead.
vi.mock('@/cms/db/connect', () => ({
  resolveD1Binding: async () => (globalThis as unknown as { __passwordPolicyD1: D1Database }).__passwordPolicyD1,
}))

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { COMMON_PASSWORDS, isCommonPassword } from '@/features/security/commonPasswords'
import {
  checkBreached,
  effectiveMinLength,
  emailName,
  parseHistory,
  passwordChangeDue,
  passwordHint,
  passwordProblems,
  pushHistory,
  reusesRecentPassword,
  serializeHistory,
  validatePassword,
  HISTORY_LIMIT,
} from '@/features/security/passwordPolicy'
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from '@/features/security/passwordPolicyDefaults'
import { rowToSettings, passwordPolicyFrom, DEFAULT_SECURITY_SETTINGS } from '@/features/security/settings'
import { passwordChangeIsDue, passwordRulesOf } from '@/features/security/passwordCheck'
import { readPasswordStateById, readPasswordStateByResetToken, recordPasswordSet } from '@/features/security/passwordStore'
import { enforcePasswordPolicyBeforeChange, recordPasswordAfterChange } from '@/features/security/passwordPolicyHooks'
import { SecuritySettings } from '@/globals/SecuritySettings'

const strict: PasswordPolicy = {
  minLength: 8,
  requireMixedCase: true,
  requireNumber: true,
  requireSymbol: true,
  blockCommon: true,
  breachCheck: false,
  historyCount: 0,
  maxAgeDays: 0,
}

const SHIPPED_MESSAGE = 'Choose a password of at least 8 characters.'

describe('password policy - defaults are today behaviour', () => {
  it('ships every rule off, the length floor at 8, and no history or age limit', () => {
    expect(DEFAULT_PASSWORD_POLICY).toEqual({
      minLength: 8,
      requireMixedCase: false,
      requireNumber: false,
      requireSymbol: false,
      blockCommon: false,
      breachCheck: false,
      historyCount: 0,
      maxAgeDays: 0,
    })
  })

  it('the Security global declares the same defaults on its flat fields', () => {
    const byName = new Map((SecuritySettings.fields as Array<{ name?: string; defaultValue?: unknown }>).map((f) => [f.name, f.defaultValue]))
    expect(byName.get('passwordMinLength')).toBe(8)
    for (const name of ['passwordRequireMixedCase', 'passwordRequireNumber', 'passwordRequireSymbol', 'passwordBlockCommon', 'passwordBreachCheck']) {
      expect(byName.get(name)).toBe(false)
    }
    expect(byName.get('passwordHistoryCount')).toBe(0)
    expect(byName.get('passwordMaxAgeDays')).toBe(0)
  })

  it('a customer password is refused below 8 characters and accepted at 8, exactly as before', () => {
    expect(validatePassword('1234567', {}, DEFAULT_PASSWORD_POLICY)).toEqual([SHIPPED_MESSAGE])
    expect(validatePassword('12345678', {}, DEFAULT_PASSWORD_POLICY)).toEqual([])
    expect(validatePassword('password', {}, DEFAULT_PASSWORD_POLICY)).toEqual([])
    expect(validatePassword('', {}, DEFAULT_PASSWORD_POLICY)).toEqual([SHIPPED_MESSAGE])
  })

  it('admin-screen writes keep having no minimum while the setting stays at 8', () => {
    expect(effectiveMinLength(DEFAULT_PASSWORD_POLICY, { adminScreen: true })).toBe(1)
    expect(validatePassword('ab', { adminScreen: true }, DEFAULT_PASSWORD_POLICY)).toEqual([])
    expect(effectiveMinLength(DEFAULT_PASSWORD_POLICY, {})).toBe(8)
  })

  it('raising the minimum above 8 reaches admin-screen writes too', () => {
    const ten = { ...DEFAULT_PASSWORD_POLICY, minLength: 10 }
    expect(validatePassword('abcdefghi', { adminScreen: true }, ten)).toEqual(['Choose a password of at least 10 characters.'])
    expect(validatePassword('abcdefghij', { adminScreen: true }, ten)).toEqual([])
  })

  it('the hint line for default rules reads as it always has', () => {
    expect(passwordHint(DEFAULT_PASSWORD_POLICY)).toBe('At least 8 characters.')
    expect(passwordRulesOf(DEFAULT_PASSWORD_POLICY)).toEqual({ minLength: 8, hint: 'At least 8 characters.' })
  })

  it('settings rows with no password columns read back as the defaults', () => {
    expect(passwordPolicyFrom(() => undefined)).toEqual(DEFAULT_PASSWORD_POLICY)
    expect(rowToSettings(null, false).passwordPolicy).toEqual(DEFAULT_PASSWORD_POLICY)
    expect(DEFAULT_SECURITY_SETTINGS.passwordPolicy).toEqual(DEFAULT_PASSWORD_POLICY)
  })

  it('clamps stored values to the ranges the screen allows', () => {
    const read = passwordPolicyFrom((key) =>
      ({ password_min_length: 12, password_history_count: 99, password_max_age_days: -4, password_require_number: 1 })[key],
    )
    expect(read.minLength).toBe(12)
    expect(read.historyCount).toBe(HISTORY_LIMIT)
    expect(read.maxAgeDays).toBe(0)
    expect(read.requireNumber).toBe(true)
  })
})

describe('password policy - each rule', () => {
  it('mixed case: needs both an upper and a lower case letter', () => {
    const rule = { ...DEFAULT_PASSWORD_POLICY, requireMixedCase: true }
    expect(validatePassword('alllowercase', {}, rule)).toHaveLength(1)
    expect(validatePassword('ALLUPPERCASE', {}, rule)).toHaveLength(1)
    expect(validatePassword('MixedCase', {}, rule)).toEqual([])
  })

  it('number: needs a digit', () => {
    const rule = { ...DEFAULT_PASSWORD_POLICY, requireNumber: true }
    expect(validatePassword('nodigitshere', {}, rule)).toEqual(['Include at least one number.'])
    expect(validatePassword('digit4here', {}, rule)).toEqual([])
  })

  it('symbol: needs a character that is not a letter or digit', () => {
    const rule = { ...DEFAULT_PASSWORD_POLICY, requireSymbol: true }
    expect(validatePassword('NoSymbol123', {}, rule)).toEqual(['Include at least one symbol, such as ! or #.'])
    expect(validatePassword('With!Symbol123', {}, rule)).toEqual([])
  })

  it('common: refuses a listed password in any letter case, and only when switched on', () => {
    const rule = { ...DEFAULT_PASSWORD_POLICY, blockCommon: true }
    expect(validatePassword('Password', {}, rule)).toEqual(['That password is too common. Choose something less easy to guess.'])
    expect(validatePassword('Password', {}, DEFAULT_PASSWORD_POLICY)).toEqual([])
  })

  it('common: refuses a password that contains the name part of the email address', () => {
    const rule = { ...DEFAULT_PASSWORD_POLICY, blockCommon: true }
    const context = { email: 'Jordan.Smith@example.com' }
    expect(emailName(context.email)).toBe('jordan.smith')
    expect(validatePassword('jordan.smith-2026', context, rule)).toEqual(['Do not use the name part of your email address in the password.'])
    expect(validatePassword('a-long-unrelated-phrase', context, rule)).toEqual([])
    expect(emailName('al@example.com')).toBeNull()
  })

  it('the bundled common list has around 200 entries, all ASCII, and matches case-insensitively', () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThanOrEqual(200)
    expect(COMMON_PASSWORDS.every((entry) => /^[\x21-\x7e]+$/.test(entry))).toBe(true)
    expect(isCommonPassword('QWERTY')).toBe(true)
    expect(isCommonPassword('correct horse battery staple')).toBe(false)
  })

  it('every rule switched on is reported together, and the hint names each one', () => {
    expect(validatePassword('short', {}, strict)).toEqual([SHIPPED_MESSAGE])
    expect(validatePassword('lowercase1!', {}, strict)).toEqual(['Include both upper-case and lower-case letters.'])
    const hint = passwordHint(strict)
    expect(hint).toContain('upper and lower case letters')
    expect(hint).toContain('a number')
    expect(hint).toContain('a symbol')
    expect(hint).toContain('Common passwords and your email name are not allowed.')
  })
})

describe('password policy - breach check (Pwned Passwords range, k-anonymity, fail open)', () => {
  const full = createHash('sha1').update('password').digest('hex').toUpperCase()
  const prefix = full.slice(0, 5)
  const suffix = full.slice(5)

  it('sends only the first five characters of the SHA-1 and reports a listed password as breached', async () => {
    const fetchImpl = vi.fn(async () => new Response(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffix}:3730471\r\n`, { status: 200 }))
    const breached = await checkBreached('password', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(breached).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`)
    expect(url).not.toContain(suffix)
    expect(url).not.toContain(full)
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain(suffix)
  })

  it('a suffix listed with a zero count is not breached', async () => {
    const fetchImpl = vi.fn(async () => new Response(`${suffix}:0\r\n`, { status: 200 }))
    expect(await checkBreached('password', { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false)
  })

  it('a password not in the range is not breached', async () => {
    const fetchImpl = vi.fn(async () => new Response('0000000000000000000000000000000000A:1\r\n', { status: 200 }))
    expect(await checkBreached('password', { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false)
  })

  it('fails open on a network error, a server error, and a timeout', async () => {
    const failing = vi.fn(async () => {
      throw new Error('socket hang up')
    })
    expect(await checkBreached('password', { fetchImpl: failing as unknown as typeof fetch })).toBe(false)

    const server = vi.fn(async () => new Response('nope', { status: 503 }))
    expect(await checkBreached('password', { fetchImpl: server as unknown as typeof fetch })).toBe(false)

    const hangs = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const started = Date.now()
    expect(await checkBreached('password', { fetchImpl: hangs as unknown as typeof fetch, timeoutMs: 50 })).toBe(false)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('is only consulted when the owner switches the check on', async () => {
    const fetchImpl = vi.fn(async () => new Response(`${suffix}:9\r\n`, { status: 200 }))
    const off = await passwordProblems('password', {}, { ...DEFAULT_PASSWORD_POLICY, minLength: 8 }, [], { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(off).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
    const on = await passwordProblems('password', {}, { ...DEFAULT_PASSWORD_POLICY, breachCheck: true }, [], { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(on).toEqual(['That password has appeared in a known data breach. Choose a different one.'])
  })
})

describe('password policy - history and maximum age', () => {
  it('reads a damaged history column as empty, never as an error', () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory('not json')).toEqual([])
    expect(parseHistory('{"a":1}')).toEqual([])
    expect(parseHistory('[{"salt":"s"}]')).toEqual([])
  })

  it('refuses a reuse of one of the last N passwords, and allows an older one', () => {
    let history = pushHistory([], 'first-pass-A1')
    history = pushHistory(history, 'second-pass-B2')
    history = pushHistory(history, 'third-pass-C3')
    expect(reusesRecentPassword('third-pass-C3', history, 2)).toBe(true)
    expect(reusesRecentPassword('second-pass-B2', history, 2)).toBe(true)
    expect(reusesRecentPassword('first-pass-A1', history, 2)).toBe(false)
    expect(reusesRecentPassword('first-pass-A1', history, 0)).toBe(false)
    expect(parseHistory(serializeHistory(history))).toEqual(history)
  })

  it('keeps at most HISTORY_LIMIT entries', () => {
    let history: ReturnType<typeof pushHistory> = []
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) history = pushHistory(history, `pass-number-${i}`)
    expect(history).toHaveLength(HISTORY_LIMIT)
  })

  it('passwordProblems reports a reuse only when the history rule is on', async () => {
    const history = pushHistory([], 'used-before-1')
    const on = { ...DEFAULT_PASSWORD_POLICY, historyCount: 1 }
    expect(await passwordProblems('used-before-1', {}, on, history)).toEqual(['You cannot reuse one of your last 1 passwords.'])
    expect(await passwordProblems('used-before-1', {}, DEFAULT_PASSWORD_POLICY, history)).toEqual([])
  })

  it('the maximum age is a predicate: off at 0, due only after the number of days has passed', () => {
    const now = new Date('2026-10-24T12:00:00.000Z')
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
    expect(passwordChangeDue(days(400), 0, now)).toBe(false)
    expect(passwordChangeDue(days(31), 30, now)).toBe(true)
    expect(passwordChangeDue(days(10), 30, now)).toBe(false)
    expect(passwordChangeDue(null, 30, now)).toBe(false)
    expect(passwordChangeDue('not a date', 30, now)).toBe(false)
  })

  it('the policy is a plain description: nothing it returns is a lockout', () => {
    const problems = validatePassword('x', {}, { ...DEFAULT_PASSWORD_POLICY, maxAgeDays: 30 })
    expect(problems).toEqual([SHIPPED_MESSAGE])
  })
})

describe('password policy - database, hooks and first admin (migrated D1)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let userId: number

  // The settings a stub engine hands the policy code, keyed the way the engine returns them.
  const engineWith = (settings: Record<string, unknown>) =>
    ({
      findGlobal: async ({ slug }: { slug: string }) => (slug === 'security-settings' ? settings : { features: {} }),
    }) as never

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    ;(globalThis as unknown as { __passwordPolicyD1: D1Database }).__passwordPolicyD1 = proxy.env.D1
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    const now = new Date().toISOString()
    await proxy.env.D1.prepare("INSERT INTO `eg_users` (email, created_at, updated_at) VALUES ('owner@example.com', ?, ?)").bind(now, now).run()
    userId = Number(((await proxy.env.D1.prepare("SELECT id FROM `eg_users` WHERE email = 'owner@example.com'").first()) as { id: number }).id)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('the migration adds the policy columns with the shipped defaults', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('password_min_length')).toBe('8')
    expect(byName.get('password_history_count')).toBe('0')
    expect(byName.get('password_max_age_days')).toBe('0')
    const users = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(users).toEqual(expect.arrayContaining(['password_changed_at', 'password_history_hashes']))
  })

  it('records a password set: stamps the time and keeps the history, and reuse is refused against it', async () => {
    await recordPasswordSet(userId, 'first-owner-pass-1')
    await recordPasswordSet(userId, 'second-owner-pass-2')
    const state = await readPasswordStateById(userId)
    expect(state?.passwordChangedAt).toBeTruthy()
    expect(state?.history).toHaveLength(2)
    expect(await passwordProblems('second-owner-pass-2', {}, { ...DEFAULT_PASSWORD_POLICY, historyCount: 1 }, state!.history)).toHaveLength(1)
    expect(await passwordProblems('first-owner-pass-1', {}, { ...DEFAULT_PASSWORD_POLICY, historyCount: 1 }, state!.history)).toEqual([])
    expect(await passwordProblems('first-owner-pass-1', {}, { ...DEFAULT_PASSWORD_POLICY, historyCount: 2 }, state!.history)).toHaveLength(1)
  })

  it('a reset token finds its account, and an unknown token finds nothing', async () => {
    await proxy.env.D1.prepare("UPDATE `eg_users` SET reset_password_token = 'tok-abc' WHERE id = ?").bind(userId).run()
    expect((await readPasswordStateByResetToken('tok-abc'))?.id).toBe(userId)
    expect(await readPasswordStateByResetToken('no-such-token')).toBeNull()
  })

  it('maximum age: a password older than the limit is due, and a recent one is not; nothing is locked', async () => {
    const old = new Date(Date.now() - 45 * 86_400_000).toISOString()
    await proxy.env.D1.prepare('UPDATE `eg_users` SET password_changed_at = ? WHERE id = ?').bind(old, userId).run()
    const engine = engineWith({ passwordMaxAgeDays: 30 })
    expect(await passwordChangeIsDue(engine, userId)).toBe(true)
    await recordPasswordSet(userId, 'fresh-owner-pass-3')
    expect(await passwordChangeIsDue(engine, userId)).toBe(false)
    expect(await passwordChangeIsDue(engineWith({ passwordMaxAgeDays: 0 }), userId)).toBe(false)
    // The check only reads; the account row is untouched by asking.
    const after = await readPasswordStateById(userId)
    expect(after?.passwordChangedAt).toBeTruthy()
  })

  it('a first admin created with no signed-in actor is not refused, even under the strictest rules', async () => {
    const strictEngine = engineWith({ passwordMinLength: 20, passwordRequireSymbol: true, passwordBlockCommon: true, passwordHistoryCount: 5 })
    await expect(
      enforcePasswordPolicyBeforeChange({ data: { email: 'first@example.com', password: 'short' }, operation: 'create' } as never),
    ).resolves.toBeUndefined()
    // Same write with a signed-in actor is checked, and refused.
    await expect(
      enforcePasswordPolicyBeforeChange({
        data: { email: 'first@example.com', password: 'short' },
        operation: 'create',
        req: { user: { id: 1 }, engine: strictEngine },
      } as never),
    ).rejects.toThrow(/at least 20 characters/)
  })

  it('an admin-screen change of a password is held to the setting, and an empty write is ignored', async () => {
    const engine = engineWith({ passwordMinLength: 8, passwordRequireNumber: true })
    await expect(
      enforcePasswordPolicyBeforeChange({
        data: { password: 'nonumbershere' },
        originalDoc: { id: userId, email: 'owner@example.com' },
        operation: 'update',
        req: { user: { id: 1 }, engine },
      } as never),
    ).rejects.toThrow('Include at least one number.')
    await expect(
      enforcePasswordPolicyBeforeChange({ data: { password: '' }, operation: 'update', req: { user: { id: 1 }, engine } } as never),
    ).resolves.toBeUndefined()
  })

  it('member signup applies the same rules, and refuses before it writes anything', async () => {
    const { registerMember } = await import('@/features/members/signup')
    const engine = engineWith({ passwordMinLength: 8, passwordRequireNumber: true })
    const settings = { featureEnabled: true, registration: { allowSignup: true, requireEmailVerification: false } } as never
    const numberless = await registerMember(engine, settings, { email: 'member@example.com', password: 'nonumberhere' } as never)
    expect(numberless).toMatchObject({ ok: false, reason: 'weak-password', error: 'Include at least one number.' })
    const short = await registerMember(engine, settings, { email: 'member@example.com', password: 'short1' } as never)
    expect(short).toMatchObject({ ok: false, reason: 'weak-password', error: 'Choose a password of at least 8 characters.' })
  })

  it('the afterChange hook stamps the account after a password write', async () => {
    await recordPasswordAfterChange({ doc: { id: userId }, data: { password: 'after-hook-pass-4' } } as never)
    const state = await readPasswordStateById(userId)
    expect(state?.history.length).toBeGreaterThan(0)
  })
})
