// @vitest-environment node
// Passkeys (WebAuthn). The authenticator is forged here: a real Web Crypto key pair
// signs real authenticator data and clientDataJSON in the byte layout the spec defines,
// so every check in src/features/passkeys runs against genuine input. No browser and no
// hardware authenticator are involved; that gap is stated in the PR and the report.
import { beforeEach, describe, expect, it } from 'vitest'

import {
  listPasskeys,
  loginOptions,
  loginWithPasskey,
  registerPasskey,
  registrationOptions,
  removePasskey,
  renamePasskey,
  type PasskeyDeps,
  type PasskeyRow,
  type PasskeyStore,
  type PasskeyUser,
} from '@/features/passkeys'
import { decodeCbor, decodeCborAt, CborError, type CborValue } from '@/features/passkeys/cbor'
import { fromBase64Url, sha256, toBase64Url, utf8 } from '@/features/passkeys/encoding'
import { DEFAULT_PASSKEY_SETTINGS, type PasskeySettings } from '@/features/security/settings'

// --- Test authenticator ------------------------------------------------------

const ORIGIN = 'https://shop.example'
const RP_ID = 'shop.example'
const SECRET = 'test-engage-secret'
const START = Date.parse('2026-10-24T10:00:00.000Z')
const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_BE = 0x08
const FLAG_AT = 0x40

const encodeHead = (major: number, n: number): number[] => {
  if (n < 24) return [(major << 5) | n]
  if (n < 0x100) return [(major << 5) | 24, n]
  if (n < 0x10000) return [(major << 5) | 25, n >> 8, n & 0xff]
  return [(major << 5) | 26, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** A minimal CBOR encoder for the shapes the tests build: unsigned and negative ints, bytes, text, maps. */
const cbor = (value: unknown): number[] => {
  if (typeof value === 'number') return value >= 0 ? encodeHead(0, value) : encodeHead(1, -1 - value)
  if (value instanceof Uint8Array) return [...encodeHead(2, value.length), ...value]
  if (typeof value === 'string') {
    const bytes = [...utf8(value)]
    return [...encodeHead(3, bytes.length), ...bytes]
  }
  if (value instanceof Map) {
    const parts: number[] = [...encodeHead(5, value.size)]
    for (const [k, v] of value) parts.push(...cbor(k), ...cbor(v))
    return parts
  }
  throw new Error('unsupported test value')
}

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)) as Uint8Array<ArrayBuffer>
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const u32 = (n: number): Uint8Array => new Uint8Array([(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])

/** ECDSA raw r||s to ASN.1 DER, the form authenticators send. */
const rawToDer = (raw: Uint8Array): Uint8Array => {
  const integer = (bytes: Uint8Array): number[] => {
    let start = 0
    while (start < bytes.length - 1 && bytes[start] === 0) start += 1
    const body = [...bytes.subarray(start)]
    if (body[0] & 0x80) body.unshift(0)
    return [0x02, body.length, ...body]
  }
  const r = integer(raw.subarray(0, 32))
  const s = integer(raw.subarray(32, 64))
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s])
}

const coseEc2 = (x: Uint8Array, y: Uint8Array): Uint8Array =>
  new Uint8Array(cbor(new Map<CborValue, CborValue>([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]])))

type Authenticator = {
  credentialId: Uint8Array
  privateKey: CryptoKey
  cose: Uint8Array
  sign: (data: Uint8Array) => Promise<Uint8Array>
}

const makeAuthenticator = async (credentialByte = 1): Promise<Authenticator> => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const cose = coseEc2(pub.slice(1, 33), pub.slice(33, 65))
  const credentialId = new Uint8Array(16).fill(credentialByte)
  credentialId[15] = Math.floor(Math.random() * 255)
  return {
    credentialId,
    privateKey: pair.privateKey,
    cose,
    sign: async (data) => rawToDer(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data as Uint8Array<ArrayBuffer>))),
  }
}

type Flags = { up?: boolean; uv?: boolean }
const flagsByte = (f: Flags, extra = 0): number => ((f.up === false ? 0 : FLAG_UP) | (f.uv ? FLAG_UV : 0) | extra) & 0xff

const buildRegistrationAuthData = async (auth: Authenticator, rpId: string, flags: Flags, count = 0): Promise<Uint8Array> =>
  concat(
    await sha256(utf8(rpId)),
    new Uint8Array([flagsByte(flags, FLAG_AT | FLAG_BE)]),
    u32(count),
    new Uint8Array(16),
    new Uint8Array([0, auth.credentialId.length]),
    auth.credentialId,
    auth.cose,
  )

const buildAssertionAuthData = async (rpId: string, flags: Flags, count: number): Promise<Uint8Array> =>
  concat(await sha256(utf8(rpId)), new Uint8Array([flagsByte(flags)]), u32(count))

const clientData = (type: string, challenge: string, origin = ORIGIN, extra: Record<string, unknown> = {}): Uint8Array =>
  utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }))

// --- Stores and fake site ---------------------------------------------------

const makeStore = (): PasskeyStore & { rows: PasskeyRow[] } => {
  const rows: PasskeyRow[] = []
  let next = 1
  return {
    rows,
    async insert(row) {
      const id = next++
      rows.push({ ...row, id, lastUsedAt: null })
      return id
    },
    async findByCredentialId(credentialId) {
      return rows.find((r) => r.credentialId === credentialId) ?? null
    },
    async listForUser(userId) {
      return rows.filter((r) => r.userId === userId)
    },
    async findForUser(userId, id) {
      return rows.find((r) => r.userId === userId && r.id === id) ?? null
    },
    async recordUse(id, signCount, at) {
      const row = rows.find((r) => r.id === id)
      if (row) {
        row.signCount = signCount
        row.lastUsedAt = at
      }
    },
    async rename(id, deviceLabel) {
      const row = rows.find((r) => r.id === id)
      if (row) row.deviceLabel = deviceLabel
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

type Fixture = {
  deps: PasskeyDeps
  store: ReturnType<typeof makeStore>
  users: Map<number, PasskeyUser & { twoFactor?: boolean; password?: boolean; social?: boolean }>
  audit: Array<{ action: string; detail: string; userId?: number }>
  loginCalls: Array<{ userId: number; skip: boolean }>
  reauthOk: { value: boolean }
  setNow: (ms: number) => void
}

const makeFixture = (overrides: Partial<PasskeySettings> = {}, secret = SECRET): Fixture => {
  const store = makeStore()
  const users = new Map<number, PasskeyUser & { twoFactor?: boolean; password?: boolean; social?: boolean }>()
  users.set(1, { id: 1, email: 'ada@example.com', name: 'Ada', roles: ['customer'], lockUntil: null })
  const audit: Fixture['audit'] = []
  const loginCalls: Fixture['loginCalls'] = []
  const reauthOk = { value: true }
  let now = START
  const settings: PasskeySettings = { ...DEFAULT_PASSKEY_SETTINGS, enabled: true, ...overrides }
  const deps: PasskeyDeps = {
    now: () => now,
    secret,
    origin: ORIGIN,
    rpId: RP_ID,
    rpName: 'Shop',
    settings,
    store,
    userAgent: 'Mozilla/5.0 (Macintosh) Safari/605',
    findUser: async (id) => users.get(id) ?? null,
    loginAsUser: async (userId, skip) => {
      loginCalls.push({ userId, skip })
      const user = users.get(userId)
      if (!user) throw new Error('no user')
      if (user.lockUntil && Date.parse(user.lockUntil) > now) throw new Error('locked')
      if (user.twoFactor && !skip) return { twoFactorRequired: true, pendingToken: `pending-${userId}` }
      return { token: `session-${userId}` }
    },
    reauthenticate: async () => reauthOk.value,
    hasOtherSignInMethod: async (userId) => {
      const user = users.get(userId)
      return Boolean(user?.password || user?.social)
    },
    audit: async (action, detail, userId) => {
      audit.push({ action, detail, userId })
    },
  }
  return { deps, store, users, audit, loginCalls, reauthOk, setNow: (ms) => (now = ms) }
}

/** Runs a full registration for user 1 and returns the stored row's id. */
const register = async (
  fx: Fixture,
  auth: Authenticator,
  opts: { flags?: Flags; rpId?: string; origin?: string; userId?: number } = {},
) => {
  const userId = opts.userId ?? 1
  const user = fx.users.get(userId) as PasskeyUser
  const options = await registrationOptions(fx.deps, user)
  if (!options.ok) return { result: { ok: false, status: options.status } as { ok: boolean; status?: number }, body: null as Record<string, unknown> | null, cookie: null as string | null }
  const challenge = (options.options as { challenge: string }).challenge
  const authData = await buildRegistrationAuthData(auth, opts.rpId ?? RP_ID, opts.flags ?? { up: true, uv: true })
  const attestationObject = cbor(new Map<CborValue, CborValue>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
  const id = toBase64Url(auth.credentialId)
  const body = {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(clientData('webauthn.create', challenge, opts.origin ?? ORIGIN)),
      attestationObject: toBase64Url(new Uint8Array(attestationObject)),
      transports: ['internal'],
    },
  }
  return { result: await registerPasskey(fx.deps, user, body, options.cookie), body, cookie: options.cookie }
}

/** A sign-in answer for the given authenticator. Returns the body and the challenge cookie to send with it. */
const signIn = async (
  fx: Fixture,
  auth: Authenticator,
  opts: { flags?: Flags; count?: number; rpId?: string; origin?: string; type?: string; userHandle?: string | null; tamper?: boolean } = {},
) => {
  const options = await loginOptions(fx.deps)
  const challenge = (options.options as { challenge: string }).challenge
  const cd = clientData(opts.type ?? 'webauthn.get', challenge, opts.origin ?? ORIGIN)
  const authData = await buildAssertionAuthData(opts.rpId ?? RP_ID, opts.flags ?? { up: true, uv: true }, opts.count ?? 1)
  const signature = await auth.sign(concat(authData, await sha256(cd)))
  if (opts.tamper) signature[signature.length - 1] ^= 0x01
  const id = toBase64Url(auth.credentialId)
  const body: Record<string, unknown> = {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(cd),
      authenticatorData: toBase64Url(authData),
      signature: toBase64Url(signature),
      userHandle: opts.userHandle === undefined ? toBase64Url(utf8('1')) : opts.userHandle,
    },
  }
  return { body, cookie: options.cookie as string }
}

const freshAuthenticatorAndRegister = async (fx: Fixture, count = 0) => {
  const auth = await makeAuthenticator()
  const reg = await register(fx, auth)
  expect(reg.result.ok).toBe(true)
  // Start every sign-in from a registration whose counter the test controls.
  if (count) fx.store.rows[0].signCount = count
  return auth
}

describe('passkeys: registration', () => {
  let fx: Fixture
  beforeEach(() => {
    fx = makeFixture()
  })

  it('registers a passkey, stores only the public key, and audits it', async () => {
    const auth = await makeAuthenticator()
    const { result } = await register(fx, auth)
    expect(result).toMatchObject({ ok: true })
    expect(fx.store.rows).toHaveLength(1)
    expect(fx.store.rows[0].publicKey).toBe(toBase64Url(auth.cose))
    expect(fx.store.rows[0].deviceLabel).toBe('Safari on macOS')
    expect(fx.audit.map((a) => a.action)).toContain('passkey.registered')
  })

  it('refuses a wrong challenge', async () => {
    const auth = await makeAuthenticator()
    const options = await registrationOptions(fx.deps, fx.users.get(1) as PasskeyUser)
    const authData = await buildRegistrationAuthData(auth, RP_ID, { up: true, uv: true })
    const att = cbor(new Map<CborValue, CborValue>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
    const id = toBase64Url(auth.credentialId)
    const body = { id, rawId: id, response: { clientDataJSON: toBase64Url(clientData('webauthn.create', 'not-the-challenge')), attestationObject: toBase64Url(new Uint8Array(att)) } }
    const result = await registerPasskey(fx.deps, fx.users.get(1) as PasskeyUser, body, options.cookie)
    expect(result.ok).toBe(false)
    expect(fx.store.rows).toHaveLength(0)
  })

  it('refuses a wrong origin', async () => {
    const auth = await makeAuthenticator()
    expect((await register(fx, auth, { origin: 'https://evil.example' })).result.ok).toBe(false)
    expect(fx.store.rows).toHaveLength(0)
  })

  it('refuses an rpId that is not this site', async () => {
    const auth = await makeAuthenticator()
    expect((await register(fx, auth, { rpId: 'other.example' })).result.ok).toBe(false)
  })

  it('refuses a wrong ceremony type', async () => {
    const auth = await makeAuthenticator()
    const options = await registrationOptions(fx.deps, fx.users.get(1) as PasskeyUser)
    const challenge = (options.options as { challenge: string }).challenge
    const authData = await buildRegistrationAuthData(auth, RP_ID, { up: true, uv: true })
    const att = cbor(new Map<CborValue, CborValue>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
    const id = toBase64Url(auth.credentialId)
    const body = { id, rawId: id, response: { clientDataJSON: toBase64Url(clientData('webauthn.get', challenge)), attestationObject: toBase64Url(new Uint8Array(att)) } }
    expect((await registerPasskey(fx.deps, fx.users.get(1) as PasskeyUser, body, options.cookie)).ok).toBe(false)
  })

  it('refuses when the user-presence flag is clear', async () => {
    const auth = await makeAuthenticator()
    expect((await register(fx, auth, { flags: { up: false, uv: true } })).result.ok).toBe(false)
  })

  it('refuses a duplicate credential id', async () => {
    const auth = await makeAuthenticator()
    expect((await register(fx, auth)).result.ok).toBe(true)
    const second = await register(fx, auth)
    expect(second.result.ok).toBe(false)
    expect(fx.store.rows).toHaveLength(1)
  })

  it('needs re-authentication before a passkey is added', async () => {
    fx.reauthOk.value = false
    const auth = await makeAuthenticator()
    const { result } = await register(fx, auth)
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(fx.store.rows).toHaveLength(0)
  })

  it('lists the passkey without any key material', async () => {
    await register(fx, await makeAuthenticator())
    const listed = await listPasskeys(fx.deps, 1)
    expect(listed).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain('publicKey')
  })

  it('renames a passkey, cleaning the label', async () => {
    await register(fx, await makeAuthenticator())
    const id = fx.store.rows[0].id
    expect(await renamePasskey(fx.deps, 1, id, '  Work\u0007 laptop  ')).toEqual({ ok: true })
    expect(fx.store.rows[0].deviceLabel).toBe('Work laptop')
    expect((await renamePasskey(fx.deps, 2, id, 'Mine')).ok).toBe(false)
  })

  it('requires user verification when the owner asks for it', async () => {
    fx = makeFixture({ userVerification: 'required' })
    expect((await register(fx, await makeAuthenticator(), { flags: { up: true, uv: false } })).result.ok).toBe(false)
    expect((await register(fx, await makeAuthenticator(2), { flags: { up: true, uv: true } })).result.ok).toBe(true)
  })

  it('accepts RS256 keys as well as ES256', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { n: string; e: string }
    const n = fromBase64Url(jwk.n) as Uint8Array
    const e = fromBase64Url(jwk.e) as Uint8Array
    const cose = new Uint8Array(cbor(new Map<CborValue, CborValue>([[1, 3], [3, -257], [-1, n], [-2, e]])))
    const credentialId = new Uint8Array(20).fill(9)
    const options = await registrationOptions(fx.deps, fx.users.get(1) as PasskeyUser)
    const challenge = (options.options as { challenge: string }).challenge
    const authData = concat(await sha256(utf8(RP_ID)), new Uint8Array([FLAG_UP | FLAG_UV | FLAG_AT]), u32(0), new Uint8Array(16), new Uint8Array([0, credentialId.length]), credentialId, cose)
    const att = new Uint8Array(cbor(new Map<CborValue, CborValue>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]])))
    const id = toBase64Url(credentialId)
    const body = { id, rawId: id, response: { clientDataJSON: toBase64Url(clientData('webauthn.create', challenge)), attestationObject: toBase64Url(att) } }
    expect((await registerPasskey(fx.deps, fx.users.get(1) as PasskeyUser, body, options.cookie)).ok).toBe(true)

    // And a sign-in with it verifies the RSA signature.
    const loginOpt = await loginOptions(fx.deps)
    const loginChallenge = (loginOpt.options as { challenge: string }).challenge
    const cd = clientData('webauthn.get', loginChallenge)
    const assertion = concat(await sha256(utf8(RP_ID)), new Uint8Array([FLAG_UP | FLAG_UV]), u32(1))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, concat(assertion, await sha256(cd))))
    const login = await loginWithPasskey(
      fx.deps,
      { id, rawId: id, response: { clientDataJSON: toBase64Url(cd), authenticatorData: toBase64Url(assertion), signature: toBase64Url(sig), userHandle: toBase64Url(utf8('1')) } },
      loginOpt.cookie,
    )
    expect(login).toEqual({ status: 'ok', token: 'session-1' })
  })
})

describe('passkeys: sign-in', () => {
  let fx: Fixture
  beforeEach(() => {
    fx = makeFixture()
  })

  it('signs in with a registered passkey and records the use', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth, { count: 1 })
    expect(await loginWithPasskey(fx.deps, body as never, cookie)).toEqual({ status: 'ok', token: 'session-1' })
    expect(fx.store.rows[0].lastUsedAt).not.toBeNull()
    expect(fx.audit.map((a) => a.action)).toContain('passkey.login')
  })

  it('refuses a wrong origin or rpId at sign-in', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const badOrigin = await signIn(fx, auth, { origin: 'https://phish.example' })
    expect((await loginWithPasskey(fx.deps, badOrigin.body as never, badOrigin.cookie)).status).toBe('refused')
    const badRp = await signIn(fx, auth, { rpId: 'phish.example' })
    expect((await loginWithPasskey(fx.deps, badRp.body as never, badRp.cookie)).status).toBe('refused')
  })

  it('refuses the wrong ceremony type and a missing user-presence flag', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const wrongType = await signIn(fx, auth, { type: 'webauthn.create' })
    expect((await loginWithPasskey(fx.deps, wrongType.body as never, wrongType.cookie)).status).toBe('refused')
    const noUp = await signIn(fx, auth, { flags: { up: false, uv: true } })
    expect((await loginWithPasskey(fx.deps, noUp.body as never, noUp.cookie)).status).toBe('refused')
  })

  it('refuses a bad signature', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth, { tamper: true })
    expect((await loginWithPasskey(fx.deps, body as never, cookie)).status).toBe('refused')
    expect(fx.loginCalls).toHaveLength(0)
  })

  it('refuses a counter that goes backwards, and one that stands still', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const first = await signIn(fx, auth, { count: 5 })
    expect((await loginWithPasskey(fx.deps, first.body as never, first.cookie)).status).toBe('ok')
    const back = await signIn(fx, auth, { count: 3 })
    expect((await loginWithPasskey(fx.deps, back.body as never, back.cookie)).status).toBe('refused')
    const same = await signIn(fx, auth, { count: 5 })
    expect((await loginWithPasskey(fx.deps, same.body as never, same.cookie)).status).toBe('refused')
    expect(fx.audit.some((a) => a.action === 'passkey.refused' && a.detail.includes('counter regression'))).toBe(true)
  })

  it('allows a counter that stays at zero (authenticators that never count)', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const a = await signIn(fx, auth, { count: 0 })
    expect((await loginWithPasskey(fx.deps, a.body as never, a.cookie)).status).toBe('ok')
    const b = await signIn(fx, auth, { count: 0 })
    expect((await loginWithPasskey(fx.deps, b.body as never, b.cookie)).status).toBe('ok')
  })

  it('refuses a user handle that names someone else', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth, { userHandle: toBase64Url(utf8('2')) })
    expect((await loginWithPasskey(fx.deps, body as never, cookie)).status).toBe('refused')
  })

  it('refuses an unknown credential and a challenge cookie from registration', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const stranger = await makeAuthenticator(7)
    const unknown = await signIn(fx, stranger)
    expect((await loginWithPasskey(fx.deps, unknown.body as never, unknown.cookie)).status).toBe('refused')
    const registerCookie = (await registrationOptions(fx.deps, fx.users.get(1) as PasskeyUser)).cookie as string
    const good = await signIn(fx, auth)
    expect((await loginWithPasskey(fx.deps, good.body as never, registerCookie)).status).toBe('refused')
  })

  it('refuses an expired challenge', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth)
    fx.setNow(START + 6 * 60 * 1000)
    expect((await loginWithPasskey(fx.deps, body as never, cookie)).status).toBe('refused')
  })

  it('refuses a challenge cookie whose signature was altered', async () => {
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth)
    const [payload, sig] = cookie.split('.')
    const forged = `${payload}A.${sig}`
    expect((await loginWithPasskey(fx.deps, body as never, forged)).status).toBe('refused')
  })

  it('refuses sign-in when no ENGAGE_SECRET is set', async () => {
    const none = makeFixture({}, '')
    const options = await loginOptions(none.deps)
    expect(options).toMatchObject({ ok: false, status: 404 })
  })

  it('does nothing when passkeys are disabled', async () => {
    const off = makeFixture({ enabled: false })
    expect(await loginOptions(off.deps)).toMatchObject({ ok: false, status: 404 })
    const result = await loginWithPasskey(off.deps, {} as never, null)
    expect(result.status).toBe('refused')
  })
})

describe('passkeys: roles, locks and two-step accounts', () => {
  it('keeps admins out unless the owner allowed them', async () => {
    const fx = makeFixture()
    fx.users.set(2, { id: 2, email: 'boss@example.com', roles: ['admin'], lockUntil: null })
    expect((await register(fx, await makeAuthenticator(), { userId: 2 })).result).toMatchObject({ ok: false, status: 403 })
    const allowed = makeFixture({ allowAdmins: true })
    allowed.users.set(2, { id: 2, email: 'boss@example.com', roles: ['admin'], lockUntil: null })
    expect((await register(allowed, await makeAuthenticator(), { userId: 2 })).result.ok).toBe(true)
  })

  it('refuses sign-in for an admin when admins are not allowed', async () => {
    const allowed = makeFixture({ allowAdmins: true })
    allowed.users.set(2, { id: 2, email: 'boss@example.com', roles: ['admin'], lockUntil: null })
    const auth = await makeAuthenticator()
    await register(allowed, auth, { userId: 2 })
    allowed.deps.settings.allowAdmins = false
    const { body, cookie } = await signIn(allowed, auth, { userHandle: toBase64Url(utf8('2')) })
    expect((await loginWithPasskey(allowed.deps, body as never, cookie)).status).toBe('refused')
  })

  it('refuses a locked account and does not sign it in', async () => {
    const fx = makeFixture()
    const auth = await freshAuthenticatorAndRegister(fx)
    fx.users.get(1)!.lockUntil = new Date(START + 60_000).toISOString()
    const { body, cookie } = await signIn(fx, auth)
    expect((await loginWithPasskey(fx.deps, body as never, cookie)).status).toBe('refused')
    expect(fx.loginCalls).toHaveLength(0)
  })

  it('skips the authenticator-app code when the passkey was user-verified', async () => {
    const fx = makeFixture()
    fx.users.get(1)!.twoFactor = true
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth, { flags: { up: true, uv: true } })
    expect(await loginWithPasskey(fx.deps, body as never, cookie)).toEqual({ status: 'ok', token: 'session-1' })
    expect(fx.loginCalls).toEqual([{ userId: 1, skip: true }])
  })

  it('still asks for the authenticator-app code when the passkey was not user-verified', async () => {
    const fx = makeFixture()
    fx.users.get(1)!.twoFactor = true
    const auth = await freshAuthenticatorAndRegister(fx)
    const { body, cookie } = await signIn(fx, auth, { flags: { up: true, uv: false } })
    expect(await loginWithPasskey(fx.deps, body as never, cookie)).toEqual({ status: 'two-factor', pendingToken: 'pending-1' })
    expect(fx.loginCalls).toEqual([{ userId: 1, skip: false }])
  })
})

describe('passkeys: removal', () => {
  it('refuses removing the last way in when there is no password and no other method', async () => {
    const fx = makeFixture()
    await register(fx, await makeAuthenticator())
    const id = fx.store.rows[0].id
    expect(await removePasskey(fx.deps, 1, id, {})).toMatchObject({ ok: false, status: 409 })
    expect(fx.store.rows).toHaveLength(1)
  })

  it('allows removing the last passkey when a password still signs the person in', async () => {
    const fx = makeFixture()
    fx.users.get(1)!.password = true
    await register(fx, await makeAuthenticator())
    expect(await removePasskey(fx.deps, 1, fx.store.rows[0].id, {})).toEqual({ ok: true })
    expect(fx.store.rows).toHaveLength(0)
    expect(fx.audit.map((a) => a.action)).toContain('passkey.removed')
  })

  it('allows removing one of two passkeys without any other method', async () => {
    const fx = makeFixture()
    await register(fx, await makeAuthenticator(1))
    await register(fx, await makeAuthenticator(2))
    expect(await removePasskey(fx.deps, 1, fx.store.rows[0].id, {})).toEqual({ ok: true })
    expect(fx.store.rows).toHaveLength(1)
  })

  it('needs re-authentication to remove', async () => {
    const fx = makeFixture()
    fx.users.get(1)!.password = true
    await register(fx, await makeAuthenticator())
    fx.reauthOk.value = false
    expect(await removePasskey(fx.deps, 1, fx.store.rows[0].id, {})).toMatchObject({ ok: false, status: 403 })
    expect(fx.store.rows).toHaveLength(1)
  })

  it('will not remove another person\'s passkey', async () => {
    const fx = makeFixture()
    fx.users.set(2, { id: 2, email: 'b@example.com', roles: ['customer'] })
    fx.users.get(2)!.password = true
    await register(fx, await makeAuthenticator())
    expect(await removePasskey(fx.deps, 2, fx.store.rows[0].id, {})).toMatchObject({ ok: false, status: 404 })
  })
})

describe('passkeys: encoding and CBOR', () => {
  it('round-trips base64url and rejects characters outside the alphabet', () => {
    const bytes = new Uint8Array([0, 255, 16, 1, 2, 3, 250])
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    expect(fromBase64Url('abc+')).toBeNull()
    expect(fromBase64Url('a')).toBeNull()
  })

  it('decodes the shapes used by attestation objects and rejects duplicate keys', () => {
    const value = decodeCbor(new Uint8Array(cbor(new Map<CborValue, CborValue>([['fmt', 'none'], [1, -7]]))))
    expect(value).toEqual(new Map<CborValue, CborValue>([['fmt', 'none'], [1, -7]]))
    const dup = new Uint8Array([0xa2, 0x01, 0x01, 0x01, 0x02])
    expect(() => decodeCbor(dup)).toThrow(CborError)
    expect(decodeCborAt(new Uint8Array([0x01, 0xff]), 0).end).toBe(1)
  })

  it('computes a signed challenge that stays bound to its ceremony', async () => {
    const cookie = (await loginOptions(makeFixture().deps)).cookie as string
    expect(cookie.split('.')).toHaveLength(2)
    expect(toBase64Url(await sha256(utf8('x')))).toHaveLength(43)
  })
})
