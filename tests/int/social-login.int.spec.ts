// Social login: the provider registry, state/CSRF, PKCE, id_token verification,
// the account-linking policy, 2FA, unlinking, the settings guard and the setup
// guides. Fake providers and a fake fetch - nothing here touches a network, and
// none of the six real providers is exercised (that needs real credentials).
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { hashPassword, loginAsUser, type AuthDbOps, type AuthUserRow } from '@/localapi/auth'
import { SecuritySettings } from '@/globals/SecuritySettings'
import { SocialButtons } from '@/features/socialLogin/components/SocialButtons'
import { appleClientSecret, clearJwksCache, verifyIdToken } from '@/features/socialLogin/jwt'
import { identityFromClaims, pkceChallenge } from '@/features/socialLogin/flow'
import {
  handleCallback,
  handlePending,
  handleProviders,
  handleStart,
  safeNext,
  type SocialRuntime,
} from '@/features/socialLogin/http'
import { placeholderPassword, hasRealPassword } from '@/features/socialLogin/passwords'
import {
  PROVIDER_IDS,
  PROVIDERS,
  emptySocialConfig,
  hasCredentials,
  isUsable,
  missingCredentials,
  redirectUriFor,
  safeTenant,
  type ProviderId,
  type SocialConfig,
} from '@/features/socialLogin/providers'
import { resolveUnlink, type PolicyDeps, type UserLite } from '@/features/socialLogin/service'
import { configFromDoc, usableProviders } from '@/features/socialLogin/settings'
import { SETUP_GUIDES, guideFor, incompleteGuides } from '@/features/socialLogin/setupGuides'
import { STATE_COOKIE, openState, sealState } from '@/features/socialLogin/state'
import type { SocialAccountRow, SocialStore } from '@/features/socialLogin/store'
import { socialTestSummary } from '@/features/socialLogin/testResult'
import { mergedProvider, refuseSocialSwitchWithoutCredentials, socialSwitchProblem } from '@/features/socialLogin/validate'
import { b64urlEncode } from '@/features/socialLogin/util'

const SECRET = 'social-test-secret'
const ORIGIN = 'https://shop.example.com'
const PASSWORD = 'correct horse battery staple'

// --- Fake provider keys and tokens -----------------------------------------

let rsa: { privateKey: CryptoKey; jwk: JsonWebKey }
let otherRsa: { privateKey: CryptoKey }
const KID = 'test-kid'

async function makeRsa(): Promise<{ privateKey: CryptoKey; jwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  return { privateKey: pair.privateKey, jwk: await crypto.subtle.exportKey('jwk', pair.publicKey) }
}

async function signJwt(claims: Record<string, unknown>, opts: { key?: CryptoKey; alg?: string; kid?: string } = {}): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' }))
  const payload = b64urlEncode(JSON.stringify(claims))
  if (opts.alg === 'none') return `${header}.${payload}.x`
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? rsa.privateKey, new TextEncoder().encode(`${header}.${payload}`)),
  )
  return `${header}.${payload}.${b64urlEncode(sig)}`
}

const nowS = (): number => Math.floor(Date.now() / 1000)

// --- Fake network -----------------------------------------------------------

type Net = {
  calls: Array<{ url: string; body: string; headers: Record<string, string> }>
  /** The id_token the token endpoint returns for OIDC providers. */
  idClaims: Record<string, unknown> | null
  idTokenOverride: string | null
  tokenStatus: number
  github: { id: number; emails: Array<{ email: string; primary: boolean; verified: boolean }> }
  discord: { id: string; email: string | null; verified: boolean }
  facebook: { id: string; email: string | null }
}

function makeNet(): Net & { fetchImpl: typeof fetch } {
  const net = {
    calls: [] as Net['calls'],
    idClaims: null as Net['idClaims'],
    idTokenOverride: null as string | null,
    tokenStatus: 200,
    github: { id: 4242, emails: [{ email: 'Pat@Example.com', primary: true, verified: true }] },
    discord: { id: 'd-1', email: 'pat@example.com', verified: true },
    facebook: { id: 'f-1', email: 'pat@example.com' },
  } as Net & { fetchImpl: typeof fetch }

  net.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v))
    net.calls.push({ url, body: String(init?.body ?? ''), headers })
    const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

    if (url.includes('/certs') || url.includes('/keys')) return json({ keys: [{ ...rsa.jwk, kid: KID, alg: 'RS256', use: 'sig' }] })
    if (/oauth2\.googleapis|appleid\.apple\.com\/auth\/token|oauth2\/v2\.0\/token/.test(url)) {
      if (net.tokenStatus !== 200) return json({ error: 'invalid_grant' }, net.tokenStatus)
      const idToken = net.idTokenOverride ?? (net.idClaims ? await signJwt(net.idClaims) : undefined)
      return json({ access_token: 'at', id_token: idToken })
    }
    if (/github\.com\/login\/oauth|discord\.com\/api\/oauth2|graph\.facebook\.com\/v19\.0\/oauth/.test(url)) {
      return net.tokenStatus !== 200 ? json({ error: 'bad' }, net.tokenStatus) : json({ access_token: 'at' })
    }
    if (url === 'https://api.github.com/user') return json({ id: net.github.id, login: 'pat' })
    if (url === 'https://api.github.com/user/emails') return json(net.github.emails)
    if (url === 'https://discord.com/api/users/@me') return json(net.discord)
    if (url.startsWith('https://graph.facebook.com/v19.0/me')) return json(net.facebook)
    return json({ error: 'unexpected ' + url }, 500)
  }) as typeof fetch
  return net
}

// --- Fake users, store, runtime --------------------------------------------

type UserRow = AuthUserRow & { emailVerifiedAt?: string | null }

function makeWorld(config: SocialConfig, opts: { requireVerification?: boolean } = {}) {
  const net = makeNet()
  const rows: UserRow[] = []
  const links: SocialAccountRow[] = []
  const audits: Array<{ action: string; detail: string; actorId?: number | null }> = []
  const state = { limited: false, nextId: 100, created: [] as number[], verified: [] as number[] }
  let session: { id: number; email: string; roles: string[] } | null = null

  const store: SocialStore = {
    async findByProviderUser(p, id) {
      return links.find((l) => l.provider === p && l.providerUserId === id) ?? null
    },
    async listForUser(userId) {
      return links.filter((l) => l.userId === userId)
    },
    async insert(row) {
      if (links.some((l) => l.provider === row.provider && l.providerUserId === row.providerUserId)) throw new Error('unique')
      links.push({ ...row, id: links.length + 1 })
    },
    async touchLogin(id, at) {
      const l = links.find((x) => x.id === id)
      if (l) l.lastLoginAt = at
    },
    async remove(userId, provider) {
      const i = links.findIndex((l) => l.userId === userId && l.provider === provider)
      if (i < 0) return false
      links.splice(i, 1)
      return true
    },
  }

  const lite = (r: UserRow | undefined): UserLite | null =>
    r ? { id: r.id, email: r.email, roles: (r.roles as string[]) ?? [], emailVerifiedAt: r.emailVerifiedAt ?? null } : null

  const authDb = {
    async findByEmail(email: string) {
      return rows.find((r) => r.email === email) ?? null
    },
    async findByID(id: number) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findByResetToken(): Promise<null> {
      return null
    },
    async updateByID(id: number, data: Partial<AuthUserRow>) {
      const r = rows.find((x) => x.id === id)
      if (!r) return null
      Object.assign(r, data)
      return r
    },
  } as unknown as AuthDbOps

  const policy = (c: SocialConfig): PolicyDeps => ({
    store,
    settings: { allowSignup: c.allowSignupViaSocial, allowAdmin: c.allowAdminSocialLogin, requireVerification: opts.requireVerification === true },
    async findUserByEmail(email) {
      return lite(rows.find((r) => r.email === email))
    },
    async findUserByID(id) {
      return lite(rows.find((r) => r.id === id))
    },
    async createCustomer(email, verified) {
      const { salt, hash } = hashPassword(placeholderPassword(SECRET, email))
      const id = state.nextId++
      rows.push({ id, email, roles: ['customer'], salt, hash, loginAttempts: 0, lockUntil: null, emailVerifiedAt: verified ? 'now' : null } as unknown as UserRow)
      state.created.push(id)
      return id
    },
    async markEmailVerified(id) {
      const r = rows.find((x) => x.id === id)
      if (r) r.emailVerifiedAt = 'now'
      state.verified.push(id)
    },
  })

  const rt: SocialRuntime = {
    secret: SECRET,
    fetchImpl: net.fetchImpl,
    now: () => Date.now(),
    origin: () => ORIGIN,
    readConfig: async () => config,
    policy,
    sessionUser: async () => session,
    login: async (userId) => {
      const result = await loginAsUser(authDb, { id: userId, secret: SECRET })
      return { token: result.token, pendingToken: result.pendingToken }
    },
    audit: async (action, _req, entry) => {
      audits.push({ action, detail: entry.detail, actorId: entry.actorId })
    },
    limited: async () => state.limited,
    sessionCookie: { name: 'engage-token', maxAgeSeconds: 7200 },
  }

  const addUser = (email: string, roles: string[], extra: Partial<UserRow> = {}): UserRow => {
    const { salt, hash } = hashPassword(PASSWORD)
    const row = { id: rows.length + 1, email, roles, salt, hash, loginAttempts: 0, lockUntil: null, emailVerifiedAt: 'earlier', ...extra } as unknown as UserRow
    rows.push(row)
    return row
  }

  return { net, rows, links, audits, state, store, rt, policy, addUser, setSession: (s: typeof session) => (session = s) }
}

const googleConfig = (patch: Partial<SocialConfig['providers']['google']> = {}, top: Partial<SocialConfig> = {}): SocialConfig => {
  const c = emptySocialConfig()
  c.providers.google = { ...c.providers.google, enabled: true, clientId: 'google-client', clientSecret: 'google-secret', ...patch }
  return { ...c, ...top }
}

const startReq = (provider: string, query = ''): Request => new Request(`${ORIGIN}/api/social/${provider}/start${query}`)

async function begin(world: ReturnType<typeof makeWorld>, provider: ProviderId, query = '') {
  const res = await handleStart(startReq(provider, query), provider, world.rt)
  const location = res.headers.get('location') ?? ''
  const setCookie = res.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]
  const url = location ? new URL(location) : null
  return { res, location, cookie, params: url?.searchParams ?? new URLSearchParams(), url }
}

function callbackReq(provider: string, params: Record<string, string>, cookie?: string, method = 'GET'): Request {
  const headers: Record<string, string> = cookie ? { cookie } : {}
  if (method === 'POST') {
    return new Request(`${ORIGIN}/api/social/${provider}/callback`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
  }
  return new Request(`${ORIGIN}/api/social/${provider}/callback?${new URLSearchParams(params).toString()}`, { headers })
}

/** Runs a whole Google sign-in with the given verified claims. */
async function googleLogin(world: ReturnType<typeof makeWorld>, claims: Record<string, unknown>, query = '') {
  const started = await begin(world, 'google', query)
  world.net.idClaims = {
    iss: 'https://accounts.google.com',
    aud: 'google-client',
    sub: 'g-sub-1',
    exp: nowS() + 600,
    iat: nowS(),
    nonce: '', // filled below from the authorize URL
    ...claims,
  }
  if (!('nonce' in claims)) world.net.idClaims.nonce = started.params.get('nonce')
  const res = await handleCallback(callbackReq('google', { code: 'the-code', state: started.params.get('state') ?? '' }, started.cookie), 'google', world.rt)
  return { started, res, location: res.headers.get('location') ?? '', cookies: res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''] }
}

beforeAll(async () => {
  rsa = await makeRsa()
  otherRsa = await makeRsa()
})

beforeEach(() => {
  clearJwksCache()
})

// --- Defaults, fail closed, buttons ----------------------------------------

describe('settings defaults and fail-closed', () => {
  it('has every provider off and sign-up on / staff off when nothing is saved', () => {
    const c = configFromDoc(null)
    expect(PROVIDER_IDS.every((id) => c.providers[id].enabled === false)).toBe(true)
    expect(c.allowSignupViaSocial).toBe(true)
    expect(c.allowAdminSocialLogin).toBe(false)
    expect(usableProviders(c)).toEqual([])
  })

  it('reads the nested group and treats null columns as the defaults', () => {
    const c = configFromDoc({ socialLogin: { googleEnabled: true, googleClientId: ' id ', googleClientSecret: 's', allowSignupViaSocial: null, microsoftTenant: '../x' } })
    expect(c.providers.google).toMatchObject({ enabled: true, clientId: 'id', clientSecret: 's' })
    expect(c.allowSignupViaSocial).toBe(true)
    expect(c.providers.microsoft.tenant).toBe('common')
    expect(safeTenant('contoso.onmicrosoft.com')).toBe('contoso.onmicrosoft.com')
  })

  it('is usable only when enabled AND every credential is present', () => {
    const c = googleConfig()
    expect(isUsable('google', c.providers.google)).toBe(true)
    expect(isUsable('google', { ...c.providers.google, clientSecret: '' })).toBe(false)
    expect(isUsable('google', { ...c.providers.google, enabled: false })).toBe(false)
    expect(missingCredentials('apple', emptySocialConfig().providers.apple)).toEqual(['Services ID', 'Team ID', 'Key ID', 'private key (.p8)'])
    expect(hasCredentials('github', { ...emptySocialConfig().providers.github, clientId: 'a', clientSecret: 'b' })).toBe(true)
  })

  it('offers buttons only for enabled and configured providers, and staff buttons only when allowed', () => {
    const c = googleConfig()
    c.providers.github = { ...c.providers.github, enabled: true, clientId: 'x' } // no secret: not offered
    c.providers.discord = { ...c.providers.discord, enabled: false, clientId: 'x', clientSecret: 'y' } // off: not offered
    expect(usableProviders(c).map((p) => p.id)).toEqual(['google'])
    expect(usableProviders(c, 'admin')).toEqual([])
    expect(usableProviders({ ...c, allowAdminSocialLogin: true }, 'admin').map((p) => p.id)).toEqual(['google'])
  })

  it('renders no button markup at all when none is available', () => {
    expect(renderToStaticMarkup(React.createElement(SocialButtons, { providers: [] }))).toBe('')
    const html = renderToStaticMarkup(React.createElement(SocialButtons, { providers: [{ id: 'google', label: 'Google' }], next: '/account/orders' }))
    expect(html).toContain('/api/social/google/start?area=account&amp;next=%2Faccount%2Forders')
    expect(html).toContain('Continue with Google')
  })

  it('lists providers over the public endpoint without credentials', async () => {
    const world = makeWorld(googleConfig())
    const body = (await (await handleProviders(new Request(`${ORIGIN}/api/social/providers`), world.rt)).json()) as { providers: unknown[] }
    expect(body).toEqual({ providers: [{ id: 'google', label: 'Google' }] })
    expect(JSON.stringify(body)).not.toContain('google-secret')
    const admin = (await (await handleProviders(new Request(`${ORIGIN}/api/social/providers?area=admin`), world.rt)).json()) as { providers: unknown[] }
    expect(admin.providers).toEqual([])
  })
})

// --- Start route ------------------------------------------------------------

describe('start', () => {
  it('404s when the provider is disabled, and for an unknown provider', async () => {
    const off = makeWorld(emptySocialConfig())
    expect((await handleStart(startReq('google'), 'google', off.rt)).status).toBe(404)
    expect((await handleStart(startReq('myspace'), 'myspace', off.rt)).status).toBe(404)
    const callback = await handleCallback(callbackReq('google', { code: 'x', state: 'y' }), 'google', off.rt)
    expect(callback.status).toBe(303) // no valid state: refused, never a token exchange
    expect(off.net.calls).toHaveLength(0)
  })

  it('is unavailable (no redirect to the provider) when enabled without credentials', async () => {
    const world = makeWorld(googleConfig({ clientSecret: '' }))
    const { res, location } = await begin(world, 'google')
    expect(res.status).toBe(303)
    expect(location).toBe(`${ORIGIN}/account/sign-in?social_error=unavailable`)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('sets a signed HttpOnly state cookie and sends state, nonce and an S256 PKCE challenge to Google', async () => {
    const world = makeWorld(googleConfig())
    const { res, params, url } = await begin(world, 'google')
    expect(url!.origin + url!.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(params.get('client_id')).toBe('google-client')
    expect(params.get('redirect_uri')).toBe(`${ORIGIN}/api/social/google/callback`)
    expect(params.get('scope')).toBe('openid email profile')
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toBeTruthy()
    expect(params.get('state')!.length).toBeGreaterThan(20)
    expect(params.get('nonce')!.length).toBeGreaterThan(20)
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^eg_social_state=/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Max-Age=600')
    expect(cookie).not.toContain(params.get('nonce')!)
  })

  it('uses PKCE where supported and a nonce only for OIDC providers', async () => {
    const c = emptySocialConfig()
    for (const id of PROVIDER_IDS) c.providers[id] = { ...c.providers[id], enabled: true, clientId: 'cid', clientSecret: 'sec', teamId: 't', keyId: 'k', privateKey: 'pk' }
    const world = makeWorld(c)
    const seen: Record<string, { pkce: boolean; nonce: boolean; mode: string | null }> = {}
    for (const id of PROVIDER_IDS) {
      const { params } = await begin(world, id)
      seen[id] = { pkce: params.has('code_challenge'), nonce: params.has('nonce'), mode: params.get('response_mode') }
    }
    expect(seen.google).toMatchObject({ pkce: true, nonce: true })
    expect(seen.microsoft).toMatchObject({ pkce: true, nonce: true })
    expect(seen.github).toMatchObject({ pkce: true, nonce: false })
    expect(seen.discord).toMatchObject({ pkce: true, nonce: false })
    expect(seen.facebook).toMatchObject({ pkce: false, nonce: false })
    expect(seen.apple).toMatchObject({ pkce: false, nonce: true, mode: 'form_post' })
  })

  it('refuses to start without ENGAGE_SECRET and when rate limited', async () => {
    const world = makeWorld(googleConfig())
    world.rt.secret = ''
    expect((await begin(world, 'google')).location).toContain('social_error=unavailable')
    world.rt.secret = SECRET
    world.state.limited = true
    expect((await begin(world, 'google')).location).toContain('social_error=rate-limited')
  })

  it('only allows sign-in next paths inside the area', () => {
    expect(safeNext('/account/orders', 'account', 'signin')).toBe('/account/orders')
    expect(safeNext('https://evil.example', 'account', 'signin')).toBe('/account')
    expect(safeNext('//evil.example', 'account', 'signin')).toBe('/account')
    expect(safeNext('/admin', 'account', 'signin')).toBe('/account')
    expect(safeNext('/account', 'admin', 'signin')).toBe('/admin')
    expect(safeNext(null, 'account', 'link')).toBe('/account/profile')
  })
})

// --- State / CSRF -----------------------------------------------------------

describe('state and CSRF', () => {
  it('refuses a callback whose state does not match the cookie, with no token exchange', async () => {
    const world = makeWorld(googleConfig())
    const started = await begin(world, 'google')
    const res = await handleCallback(callbackReq('google', { code: 'c', state: 'forged' }, started.cookie), 'google', world.rt)
    expect(res.headers.get('location')).toContain('social_error=state')
    expect(world.net.calls).toHaveLength(0)
    expect(world.rows).toHaveLength(0)
  })

  it('refuses a callback with no cookie (another browser, a planted link)', async () => {
    const world = makeWorld(googleConfig())
    const started = await begin(world, 'google')
    const res = await handleCallback(callbackReq('google', { code: 'c', state: started.params.get('state')! }), 'google', world.rt)
    expect(res.headers.get('location')).toContain('social_error=state')
    expect(world.net.calls).toHaveLength(0)
  })

  it('refuses a tampered, expired, or wrong-provider state cookie', async () => {
    const base = { p: 'google' as const, s: 'abc', v: 'v', n: 'n', mode: 'signin' as const, area: 'account' as const, next: '/account', uid: '', iat: Date.now() }
    const good = await sealState(SECRET, base)
    expect(await openState(SECRET, good, 'abc', 'google')).not.toBeNull()
    expect(await openState(SECRET, good.slice(0, -2) + 'AA', 'abc', 'google')).toBeNull()
    expect(await openState('other-secret', good, 'abc', 'google')).toBeNull()
    expect(await openState(SECRET, good, 'abc', 'github')).toBeNull()
    expect(await openState(SECRET, good, 'abd', 'google')).toBeNull()
    const old = await sealState(SECRET, { ...base, iat: Date.now() - 11 * 60 * 1000 })
    expect(await openState(SECRET, old, 'abc', 'google')).toBeNull()
    const future = await sealState(SECRET, { ...base, iat: Date.now() + 60_000 })
    expect(await openState(SECRET, future, 'abc', 'google')).toBeNull()
  })

  it('clears the state cookie on the way out (a state is single use)', async () => {
    const world = makeWorld(googleConfig())
    const { res } = await googleLogin(world, { email: 'new@example.com', email_verified: true })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('eg_social_state=;') && c.includes('Max-Age=0'))).toBe(true)
  })
})

// --- PKCE + token exchange --------------------------------------------------

describe('code exchange', () => {
  it('sends a code_verifier whose S256 is the challenge from the authorize URL', async () => {
    const world = makeWorld(googleConfig())
    const { started } = await googleLogin(world, { email: 'pkce@example.com', email_verified: true })
    const exchange = world.net.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!
    const body = new URLSearchParams(exchange.body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('the-code')
    expect(body.get('client_secret')).toBe('google-secret')
    expect(body.get('redirect_uri')).toBe(`${ORIGIN}/api/social/google/callback`)
    expect(await pkceChallenge(body.get('code_verifier')!)).toBe(started.params.get('code_challenge'))
  })

  it('treats a provider error or a refused exchange as a failed sign-in with no session', async () => {
    const world = makeWorld(googleConfig())
    const started = await begin(world, 'google')
    const denied = await handleCallback(callbackReq('google', { error: 'access_denied', state: started.params.get('state')! }, started.cookie), 'google', world.rt)
    expect(denied.headers.get('location')).toContain('social_error=denied')

    const again = await begin(world, 'google')
    world.net.tokenStatus = 400
    const res = await handleCallback(callbackReq('google', { code: 'c', state: again.params.get('state')! }, again.cookie), 'google', world.rt)
    expect(res.headers.get('location')).toContain('social_error=provider')
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(false)
    expect(world.rows).toHaveLength(0)
  })
})

// --- id_token verification --------------------------------------------------

describe('id_token verification', () => {
  const expectBase = () => ({
    jwksUrl: PROVIDERS.google.oidc!.jwksUrl,
    audience: 'google-client',
    nonce: 'n-1',
    issuerOk: (iss: string) => iss === 'https://accounts.google.com',
    fetchImpl: makeNet().fetchImpl,
  })
  const good = () => ({ iss: 'https://accounts.google.com', aud: 'google-client', sub: 's', exp: nowS() + 300, iat: nowS(), nonce: 'n-1', email: 'a@b.co' })

  it('accepts a good token', async () => {
    const claims = await verifyIdToken(await signJwt(good()), expectBase())
    expect(claims.sub).toBe('s')
  })

  it.each([
    ['bad audience', { aud: 'someone-else' }, 'audience'],
    ['bad issuer', { iss: 'https://evil.example' }, 'issuer'],
    ['expired', { exp: nowS() - 3600 }, 'expired'],
    ['bad nonce', { nonce: 'replayed' }, 'nonce'],
    ['missing subject', { sub: '' }, 'subject'],
    ['issued in the future', { iat: nowS() + 3600 }, 'not-yet-valid'],
  ])('refuses %s', async (_name, patch, reason) => {
    await expect(verifyIdToken(await signJwt({ ...good(), ...patch }), expectBase())).rejects.toMatchObject({ reason })
  })

  it('refuses a token signed with a different key, alg none, and garbage', async () => {
    await expect(verifyIdToken(await signJwt(good(), { key: otherRsa.privateKey }), expectBase())).rejects.toMatchObject({ reason: 'signature' })
    await expect(verifyIdToken(await signJwt(good(), { alg: 'none' }), expectBase())).rejects.toMatchObject({ reason: 'alg' })
    await expect(verifyIdToken(await signJwt(good(), { alg: 'HS256' }), expectBase())).rejects.toMatchObject({ reason: 'alg' })
    await expect(verifyIdToken(await signJwt(good(), { kid: 'unknown' }), expectBase())).rejects.toMatchObject({ reason: 'kid' })
    await expect(verifyIdToken('not.a.jwt', expectBase())).rejects.toBeTruthy()
    await expect(verifyIdToken('', expectBase())).rejects.toMatchObject({ reason: 'malformed' })
  })

  it('caches the key set between verifications', async () => {
    const base = expectBase()
    const net = makeNet()
    base.fetchImpl = net.fetchImpl
    await verifyIdToken(await signJwt(good()), base)
    await verifyIdToken(await signJwt(good()), base)
    expect(net.calls.filter((c) => c.url.includes('/certs'))).toHaveLength(1)
  })

  it('refuses a callback whose token has the wrong audience, issuer, expiry or nonce, without signing anyone in', async () => {
    for (const patch of [{ aud: 'other' }, { iss: 'https://evil.example' }, { exp: nowS() - 600 }, { nonce: 'wrong' }]) {
      const world = makeWorld(googleConfig())
      world.addUser('victim@example.com', ['customer'])
      const { res } = await googleLogin(world, { email: 'victim@example.com', email_verified: true, ...patch })
      expect(res.headers.get('location')).toContain('social_error=provider')
      expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(false)
      expect(world.links).toHaveLength(0)
    }
  })

  it('checks Microsoft issuers against the token tenant', () => {
    const issuerOk = PROVIDERS.microsoft.oidc!.issuerOk
    const cfg = (tenant: string) => ({ ...emptySocialConfig().providers.microsoft, tenant })
    const tid = '11111111-2222-3333-4444-555555555555'
    expect(issuerOk(`https://login.microsoftonline.com/${tid}/v2.0`, { tid }, cfg('common'))).toBe(true)
    expect(issuerOk(`https://login.microsoftonline.com/${tid}/v2.0`, { tid: 'other' }, cfg('common'))).toBe(false)
    expect(issuerOk(`https://login.microsoftonline.com/${tid}/v2.0`, { tid }, cfg(tid))).toBe(true)
    expect(issuerOk(`https://login.microsoftonline.com/${tid}/v2.0`, { tid }, cfg('99999999-0000-0000-0000-000000000000'))).toBe(false)
    expect(issuerOk('https://evil.example/x/v2.0', { tid: 'x' }, cfg('common'))).toBe(false)
  })

  it('trusts an email only as far as the provider vouches for it', () => {
    expect(identityFromClaims('google', { sub: '1', email: 'A@B.co', email_verified: true })).toMatchObject({ email: 'a@b.co', emailVerified: true })
    expect(identityFromClaims('google', { sub: '1', email: 'a@b.co', email_verified: false }).emailVerified).toBe(false)
    expect(identityFromClaims('apple', { sub: '1', email: 'a@b.co', email_verified: 'true' }).emailVerified).toBe(true)
    expect(identityFromClaims('apple', { sub: '1', email: 'a@b.co', email_verified: 'false' }).emailVerified).toBe(false)
    expect(identityFromClaims('microsoft', { sub: '1', email: 'a@b.co', tid: 'work-tenant' }).emailVerified).toBe(false)
    expect(identityFromClaims('microsoft', { sub: '1', email: 'a@b.co', tid: 'work-tenant', xms_edov: true }).emailVerified).toBe(true)
    expect(identityFromClaims('google', { sub: '1' }).emailVerified).toBe(false)
  })
})

// --- Apple ------------------------------------------------------------------

describe('Apple', () => {
  it('builds an ES256 client secret JWT with the right header and claims', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`
    const now = Date.UTC(2026, 0, 1)
    const jwt = await appleClientSecret({ teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'com.example.web', privateKey: pem }, now)
    const [h, p, s] = jwt.split('.')
    const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/')))
    expect(dec(h)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' })
    expect(dec(p)).toMatchObject({ iss: 'TEAM123456', sub: 'com.example.web', aud: 'https://appleid.apple.com', iat: now / 1000 })
    expect(dec(p).exp).toBe(now / 1000 + 300)
    const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
    expect(sig).toHaveLength(64)
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, new TextEncoder().encode(`${h}.${p}`))).toBe(true)
  })

  it('bounces the form_post return to a GET so the state cookie travels', async () => {
    const c = emptySocialConfig()
    c.providers.apple = { ...c.providers.apple, enabled: true, clientId: 'com.example.web', teamId: 't', keyId: 'k', privateKey: 'pk' }
    const world = makeWorld(c)
    const res = await handleCallback(callbackReq('apple', { code: 'abc', state: 'st' }, undefined, 'POST'), 'apple', world.rt)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/api/social/apple/callback?code=abc&state=st`)
    expect(world.net.calls).toHaveLength(0)
  })
})

// --- Other providers' profiles ----------------------------------------------

describe('non-OIDC providers', () => {
  const cfgFor = (id: ProviderId) => {
    const c = emptySocialConfig()
    c.providers[id] = { ...c.providers[id], enabled: true, clientId: 'cid', clientSecret: 'sec' }
    return c
  }
  const run = async (world: ReturnType<typeof makeWorld>, id: ProviderId) => {
    const started = await begin(world, id)
    return handleCallback(callbackReq(id, { code: 'c', state: started.params.get('state')! }, started.cookie), id, world.rt)
  }

  it('GitHub: only the primary verified email is used', async () => {
    const world = makeWorld(cfgFor('github'))
    const res = await run(world, 'github')
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(true) // created: verified email
    expect(world.rows[0].email).toBe('pat@example.com')
    expect(world.net.calls.find((c) => c.url.endsWith('/user'))!.headers.authorization).toBe('Bearer at')

    const w2 = makeWorld(cfgFor('github'))
    w2.net.github.emails = [{ email: 'pat@example.com', primary: true, verified: false }, { email: 'other@example.com', primary: false, verified: true }]
    const r2 = await run(w2, 'github')
    expect(r2.headers.get('location')).toContain('social_error=no-email')
    expect(w2.rows).toHaveLength(0)
  })

  it('Discord: honours the verified flag', async () => {
    const world = makeWorld(cfgFor('discord'))
    world.net.discord.verified = false
    const res = await run(world, 'discord')
    expect(res.headers.get('location')).toContain('social_error=unverified-email')
    expect(world.rows).toHaveLength(0)
  })

  it('Facebook: an email is never treated as verified, so nothing is created or linked by email', async () => {
    const world = makeWorld(cfgFor('facebook'))
    world.addUser('pat@example.com', ['customer'])
    const res = await run(world, 'facebook')
    expect(res.headers.get('location')).toContain('social_error=unverified-email')
    expect(world.links).toHaveLength(0)
  })
})

// --- Linking policy ---------------------------------------------------------

describe('account linking', () => {
  it('links an existing customer by a verified email and signs them in', async () => {
    const world = makeWorld(googleConfig())
    const user = world.addUser('pat@example.com', ['customer'])
    const { res, location } = await googleLogin(world, { email: 'Pat@Example.com', email_verified: true })
    expect(location).toBe(`${ORIGIN}/account`)
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token=') && c.includes('HttpOnly'))).toBe(true)
    expect(world.links).toHaveLength(1)
    expect(world.links[0]).toMatchObject({ userId: user.id, provider: 'google', providerUserId: 'g-sub-1' })
    expect(world.rows).toHaveLength(1)
    expect(world.audits.map((a) => a.action)).toEqual(['social.linked', 'social.login'])
  })

  it('signs in by the stored link on later visits, even if the provider email changed', async () => {
    const world = makeWorld(googleConfig())
    world.addUser('pat@example.com', ['customer'])
    await googleLogin(world, { email: 'pat@example.com', email_verified: true })
    const second = await googleLogin(world, { email: 'renamed@elsewhere.com', email_verified: true })
    expect(second.location).toBe(`${ORIGIN}/account`)
    expect(world.rows).toHaveLength(1)
    expect(world.links).toHaveLength(1)
  })

  it('refuses an unverified provider email: no link, no account', async () => {
    const world = makeWorld(googleConfig())
    world.addUser('pat@example.com', ['customer'])
    const { res, location } = await googleLogin(world, { email: 'pat@example.com', email_verified: false })
    expect(location).toContain('social_error=unverified-email')
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(false)
    expect(world.links).toHaveLength(0)
    expect(world.rows).toHaveLength(1)
    expect(world.audits.map((a) => a.action)).toEqual(['social.refused'])

    const none = makeWorld(googleConfig())
    const r = await googleLogin(none, { email: 'new@example.com' })
    expect(r.location).toContain('social_error=unverified-email')
    expect(none.rows).toHaveLength(0)
  })

  it('refuses to link to a customer whose own address was never confirmed (pre-registration hijack)', async () => {
    const world = makeWorld(googleConfig())
    world.addUser('victim@example.com', ['customer'], { emailVerifiedAt: null })
    const { location } = await googleLogin(world, { email: 'victim@example.com', email_verified: true })
    expect(location).toContain('social_error=unverified-account')
    expect(world.links).toHaveLength(0)
  })

  it.each([['admin'], ['editor'], ['viewer'], ['customer', 'admin']])('never auto-links a verified email to a privileged account (%s)', async (...roles) => {
    const world = makeWorld(googleConfig({}, { allowAdminSocialLogin: true }))
    world.addUser('boss@example.com', roles)
    const { res, location } = await googleLogin(world, { email: 'boss@example.com', email_verified: true })
    expect(location).toContain('social_error=privileged-no-autolink')
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(false)
    expect(world.links).toHaveLength(0)
    expect(world.audits[0].action).toBe('social.refused')
  })

  it('lets a staff account sign in only when allowed AND already linked', async () => {
    const off = makeWorld(googleConfig())
    const boss = off.addUser('boss@example.com', ['admin'])
    await off.store.insert({ userId: boss.id, provider: 'google', providerUserId: 'g-sub-1', email: 'boss@example.com', createdAt: 'x', lastLoginAt: null })
    // Staff social login is off: the admin entry point does not exist, and the public screen refuses a staff identity.
    expect((await begin(off, 'google', '?area=admin')).res.status).toBe(404)
    const refused = await googleLogin(off, { email: 'boss@example.com', email_verified: true })
    expect(refused.location).toContain('social_error=admin-disabled')

    const on = makeWorld(googleConfig({}, { allowAdminSocialLogin: true }))
    const b2 = on.addUser('boss@example.com', ['admin'])
    await on.store.insert({ userId: b2.id, provider: 'google', providerUserId: 'g-sub-1', email: 'boss@example.com', createdAt: 'x', lastLoginAt: null })
    const ok = await googleLogin(on, { email: 'boss@example.com', email_verified: true }, '?area=admin')
    expect(ok.location).toBe(`${ORIGIN}/admin`)
    expect(ok.res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(true)
  })

  it('creates customers only, with the email marked verified, when sign-up is allowed', async () => {
    const world = makeWorld(googleConfig())
    const { res, location } = await googleLogin(world, { email: 'fresh@example.com', email_verified: true, roles: ['admin'], role: 'admin' })
    expect(location).toBe(`${ORIGIN}/account`)
    expect(world.rows).toHaveLength(1)
    expect(world.rows[0].roles).toEqual(['customer'])
    expect(world.rows[0].emailVerifiedAt).toBeTruthy()
    expect(world.links).toHaveLength(1)
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(true)
  })

  it('creates nobody when sign-up via social is switched off, and never from the admin area', async () => {
    const world = makeWorld(googleConfig({}, { allowSignupViaSocial: false }))
    const { location } = await googleLogin(world, { email: 'fresh@example.com', email_verified: true })
    expect(location).toContain('social_error=signup-disabled')
    expect(world.rows).toHaveLength(0)

    const admin = makeWorld(googleConfig({}, { allowAdminSocialLogin: true }))
    const r = await googleLogin(admin, { email: 'fresh@example.com', email_verified: true }, '?area=admin')
    expect(r.location).toContain('social_error=signup-disabled')
    expect(admin.rows).toHaveLength(0)
  })

  it('still lets an already-linked customer in when sign-up is off', async () => {
    const world = makeWorld(googleConfig({}, { allowSignupViaSocial: false }))
    const user = world.addUser('pat@example.com', ['customer'])
    await world.store.insert({ userId: user.id, provider: 'google', providerUserId: 'g-sub-1', email: null, createdAt: 'x', lastLoginAt: null })
    const { location } = await googleLogin(world, { email: 'pat@example.com', email_verified: true })
    expect(location).toBe(`${ORIGIN}/account`)
  })

  it('satisfies required email verification with a matching verified provider email, and not otherwise', async () => {
    const world = makeWorld(googleConfig(), { requireVerification: true })
    const user = world.addUser('pat@example.com', ['customer'], { emailVerifiedAt: null })
    await world.store.insert({ userId: user.id, provider: 'google', providerUserId: 'g-sub-1', email: null, createdAt: 'x', lastLoginAt: null })
    const ok = await googleLogin(world, { email: 'pat@example.com', email_verified: true })
    expect(ok.location).toBe(`${ORIGIN}/account`)
    expect(world.state.verified).toEqual([user.id])
    expect(user.emailVerifiedAt).toBeTruthy()

    const w2 = makeWorld(googleConfig(), { requireVerification: true })
    const u2 = w2.addUser('pat@example.com', ['customer'], { emailVerifiedAt: null })
    await w2.store.insert({ userId: u2.id, provider: 'google', providerUserId: 'g-sub-1', email: null, createdAt: 'x', lastLoginAt: null })
    const held = await googleLogin(w2, { email: 'different@example.com', email_verified: true })
    expect(held.location).toContain('social_error=verify-first')
    expect(u2.emailVerifiedAt).toBeNull()
  })

  it('link mode: connects to the signed-in user, refuses another user\'s identity, and needs a session', async () => {
    const world = makeWorld(googleConfig())
    const me = world.addUser('me@example.com', ['customer'])
    const other = world.addUser('other@example.com', ['customer'])
    world.setSession({ id: me.id, email: me.email, roles: ['customer'] })
    const linked = await googleLogin(world, { email: 'someone-else@gmail.com', email_verified: false }, '?mode=link&next=/account/profile')
    expect(linked.location).toBe(`${ORIGIN}/account/profile?social=linked`)
    expect(world.links[0]).toMatchObject({ userId: me.id, provider: 'google' })
    expect(world.audits.map((a) => a.action)).toContain('social.linked')

    // The same Google identity cannot also be attached to someone else.
    world.setSession({ id: other.id, email: other.email, roles: ['customer'] })
    const clash = await googleLogin(world, { email: 'x@y.co' }, '?mode=link')
    expect(clash.location).toContain('social_error=already-linked')
    expect(world.links).toHaveLength(1)

    world.setSession(null)
    const anon = await begin(world, 'google', '?mode=link')
    expect(anon.location).toBe(`${ORIGIN}/account/sign-in`)
  })

  it('link mode: a session that changed mid-flow is refused', async () => {
    const world = makeWorld(googleConfig())
    const me = world.addUser('me@example.com', ['customer'])
    const other = world.addUser('other@example.com', ['customer'])
    world.setSession({ id: me.id, email: me.email, roles: ['customer'] })
    const started = await begin(world, 'google', '?mode=link')
    world.setSession({ id: other.id, email: other.email, roles: ['customer'] })
    world.net.idClaims = { iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g', exp: nowS() + 60, iat: nowS(), nonce: started.params.get('nonce') }
    const res = await handleCallback(callbackReq('google', { code: 'c', state: started.params.get('state')! }, started.cookie), 'google', world.rt)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/account/sign-in`)
    expect(world.links).toHaveLength(0)
  })

  it('staff may link from the security screen only when staff social login is on', async () => {
    const off = makeWorld(googleConfig())
    const boss = off.addUser('boss@example.com', ['admin'])
    off.setSession({ id: boss.id, email: boss.email, roles: ['admin'] })
    expect((await begin(off, 'google', '?mode=link&area=admin')).res.status).toBe(404)

    const on = makeWorld(googleConfig({}, { allowAdminSocialLogin: true }))
    const b = on.addUser('boss@example.com', ['admin'])
    on.setSession({ id: b.id, email: b.email, roles: ['admin'] })
    const r = await googleLogin(on, { email: 'anything@gmail.com' }, '?mode=link&area=admin')
    expect(r.location).toBe(`${ORIGIN}/admin/security/social?social=linked`)
    expect(on.links[0].userId).toBe(b.id)
  })
})

// --- 2FA --------------------------------------------------------------------

describe('two-step sign-in', () => {
  it('does not bypass two-step: an enrolled user gets a pending token and no session', async () => {
    const world = makeWorld(googleConfig())
    const user = world.addUser('pat@example.com', ['customer'], {
      twoFactorEnabled: true,
      twoFactorConfirmedAt: '2026-01-01T00:00:00.000Z',
      twoFactorSecret: 'enc-secret',
    })
    await world.store.insert({ userId: user.id, provider: 'google', providerUserId: 'g-sub-1', email: null, createdAt: 'x', lastLoginAt: null })
    const { res, location } = await googleLogin(world, { email: 'pat@example.com', email_verified: true })
    const cookies = res.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('engage-token='))).toBe(false)
    const pending = cookies.find((c) => c.startsWith('eg_social_pending='))!
    expect(pending).toContain('HttpOnly')
    expect(pending).toContain('Max-Age=300')
    expect(location).toContain('/account/sign-in?social=2fa')

    // The admin login screen can collect the parked token once.
    const token = pending.split(';')[0].replace('eg_social_pending=', '')
    const handed = await handlePending(new Request(`${ORIGIN}/api/social/pending`, { headers: { cookie: `eg_social_pending=${token}` } }), world.rt)
    expect(((await handed.json()) as { pendingToken: string }).pendingToken).toBe(token)
    expect(handed.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('creates a session for a user without two-step, and refuses a locked account', async () => {
    const world = makeWorld(googleConfig())
    const user = world.addUser('pat@example.com', ['customer'])
    await world.store.insert({ userId: user.id, provider: 'google', providerUserId: 'g-sub-1', email: null, createdAt: 'x', lastLoginAt: null })
    user.lockUntil = new Date(Date.now() + 600_000).toISOString()
    const locked = await googleLogin(world, { email: 'pat@example.com', email_verified: true })
    expect(locked.location).toContain('social_error=locked')
    expect(locked.res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(false)
  })
})

// --- Admin test sign-in -----------------------------------------------------

describe('Test sign-in (admin)', () => {
  it('is admin only, works before the switch is on, and touches no account', async () => {
    const world = makeWorld(googleConfig({ enabled: false }))
    expect((await begin(world, 'google', '?mode=test')).location).toBe(`${ORIGIN}/admin/login`)

    const cust = world.addUser('cust@example.com', ['customer'])
    world.setSession({ id: cust.id, email: cust.email, roles: ['customer'] })
    expect((await begin(world, 'google', '?mode=test')).location).toBe(`${ORIGIN}/admin/login`)

    const boss = world.addUser('boss@example.com', ['admin'])
    world.setSession({ id: boss.id, email: boss.email, roles: ['admin'] })
    const { res } = await googleLogin(world, { email: 'fresh@example.com', email_verified: true }, '?mode=test')
    expect(res.headers.get('location')).toBe(`${ORIGIN}/admin/settings/security?social_test=google:ok:email-verified#social-login`)
    expect(world.rows).toHaveLength(2)
    expect(world.links).toHaveLength(0)
    expect(res.headers.getSetCookie().some((c) => c.startsWith('engage-token='))).toBe(false)
  })

  it('reports why a test failed, and needs the credentials', async () => {
    const world = makeWorld(googleConfig({ enabled: false }))
    const boss = world.addUser('boss@example.com', ['admin'])
    world.setSession({ id: boss.id, email: boss.email, roles: ['admin'] })
    const started = await begin(world, 'google', '?mode=test')
    world.net.tokenStatus = 400
    const res = await handleCallback(callbackReq('google', { code: 'c', state: started.params.get('state')! }, started.cookie), 'google', world.rt)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/admin/settings/security?social_test=google:fail:exchange#social-login`)
    expect(socialTestSummary('?social_test=google:fail:exchange', 'google')).toContain('test failed')
    expect(socialTestSummary('?social_test=google:ok:email-unverified', 'google')).toContain('worked')
    expect(socialTestSummary('?social_test=google:ok', 'github')).toBeNull()

    const bare = makeWorld(googleConfig({ enabled: false, clientSecret: '' }))
    const b = bare.addUser('boss@example.com', ['admin'])
    bare.setSession({ id: b.id, email: b.email, roles: ['admin'] })
    expect((await begin(bare, 'google', '?mode=test')).location).toContain('social_test=google:fail:unavailable')
  })
})

// --- Unlinking --------------------------------------------------------------

describe('unlinking', () => {
  it('refuses to remove the last sign-in method when the account has no password of its own', async () => {
    const world = makeWorld(googleConfig())
    await googleLogin(world, { email: 'social-only@example.com', email_verified: true }) // created with a placeholder password
    const user = world.rows[0]
    const deps = { store: world.store, hasPassword: async (id: number) => hasRealPassword(world.rows.find((r) => r.id === id) as never, SECRET, [world.links[0]?.email ?? null]) }
    expect(await deps.hasPassword(user.id)).toBe(false)
    const refused = await resolveUnlink(deps, user.id, 'google')
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('only way')
    expect(world.links).toHaveLength(1)
  })

  it('allows it with a password of their own, or with another provider connected', async () => {
    const world = makeWorld(googleConfig())
    const user = world.addUser('pat@example.com', ['customer'])
    await world.store.insert({ userId: user.id, provider: 'google', providerUserId: 'g', email: null, createdAt: 'x', lastLoginAt: null })
    const hasPassword = async (id: number) => hasRealPassword(world.rows.find((r) => r.id === id) as never, SECRET)
    expect(await hasPassword(user.id)).toBe(true)
    expect((await resolveUnlink({ store: world.store, hasPassword }, user.id, 'google')).ok).toBe(true)
    expect(world.links).toHaveLength(0)

    const noPass = world.addUser('np@example.com', ['customer'])
    const { salt, hash } = hashPassword(placeholderPassword(SECRET, 'np@example.com'))
    Object.assign(noPass, { salt, hash })
    await world.store.insert({ userId: noPass.id, provider: 'google', providerUserId: 'g2', email: null, createdAt: 'x', lastLoginAt: null })
    await world.store.insert({ userId: noPass.id, provider: 'github', providerUserId: 'h2', email: null, createdAt: 'x', lastLoginAt: null })
    const np = async (id: number) => hasRealPassword(world.rows.find((r) => r.id === id) as never, SECRET)
    expect(await np(noPass.id)).toBe(false)
    expect((await resolveUnlink({ store: world.store, hasPassword: np }, noPass.id, 'google')).ok).toBe(true)
    expect((await resolveUnlink({ store: world.store, hasPassword: np }, noPass.id, 'github')).ok).toBe(false)
  })

  it('cannot unlink something that is not connected, or another user\'s link', async () => {
    const world = makeWorld(googleConfig())
    const a = world.addUser('a@example.com', ['customer'])
    const b = world.addUser('b@example.com', ['customer'])
    await world.store.insert({ userId: a.id, provider: 'google', providerUserId: 'g', email: null, createdAt: 'x', lastLoginAt: null })
    const deps = { store: world.store, hasPassword: async () => true }
    expect((await resolveUnlink(deps, b.id, 'google')).ok).toBe(false)
    expect(world.links).toHaveLength(1)
  })
})

// --- Settings: switch guard, guides, redirect URLs --------------------------

describe('settings guard', () => {
  it('refuses to switch a provider on without credentials, naming what is missing', () => {
    expect(socialSwitchProblem({ socialLogin: { googleEnabled: true } }, null)).toBe('Google sign-in cannot be switched on yet. Save the client ID, client secret first.')
    expect(socialSwitchProblem({ socialLogin: { googleEnabled: true, googleClientId: 'id' } }, null)).toContain('client secret')
    expect(socialSwitchProblem({ socialLogin: { appleEnabled: true, appleClientId: 'com.x' } }, null)).toContain('Team ID, Key ID, private key (.p8)')
    expect(() => refuseSocialSwitchWithoutCredentials({ data: { socialLogin: { githubEnabled: true } }, originalDoc: null })).toThrow(/GitHub sign-in cannot be switched on/)
  })

  it('accepts a complete provider, an untouched one, and credentials saved earlier', () => {
    expect(socialSwitchProblem({ socialLogin: { googleEnabled: true, googleClientId: 'id', googleClientSecret: 's' } }, null)).toBeNull()
    expect(socialSwitchProblem({ socialLogin: { googleEnabled: false } }, null)).toBeNull()
    expect(socialSwitchProblem({}, null)).toBeNull()
    // Flipping the switch on later uses what is already stored.
    expect(socialSwitchProblem({ socialLogin: { googleEnabled: true } }, { socialLogin: { googleClientId: 'id', googleClientSecret: 'enc:v1:abc' } })).toBeNull()
    expect(mergedProvider('google', { socialLogin: { googleEnabled: true } }, { socialLogin: { googleClientId: 'id' } }).clientId).toBe('id')
  })

  it('refuses a save that blanks the secret of a provider that is on', () => {
    expect(socialSwitchProblem({ socialLogin: { googleClientSecret: '' } }, { socialLogin: { googleEnabled: true, googleClientId: 'id', googleClientSecret: 'x' } })).toContain('client secret')
  })

  it('is wired as a beforeChange hook on the Security settings global, and the fields default off', () => {
    expect((SecuritySettings.hooks?.beforeChange ?? []).length).toBeGreaterThan(0)
    const group = SecuritySettings.fields.find((f) => (f as { name?: string }).name === 'socialLogin') as { fields: Array<{ name: string; defaultValue?: unknown; type: string }> }
    expect(group).toBeTruthy()
    for (const id of PROVIDER_IDS) expect(group.fields.find((f) => f.name === `${id}Enabled`)).toMatchObject({ type: 'checkbox', defaultValue: false })
    expect(group.fields.find((f) => f.name === 'allowSignupViaSocial')!.defaultValue).toBe(true)
    expect(group.fields.find((f) => f.name === 'allowAdminSocialLogin')!.defaultValue).toBe(false)
    expect(group.fields.find((f) => f.name === 'microsoftTenant')!.defaultValue).toBe('common')
    for (const id of PROVIDER_IDS.filter((p) => p !== 'apple')) {
      const secret = group.fields.find((f) => f.name === `${id}ClientSecret`) as { hooks?: { beforeChange?: unknown[] } }
      expect(secret.hooks?.beforeChange?.length).toBe(1)
    }
    expect((group.fields.find((f) => f.name === 'applePrivateKey') as { hooks?: unknown }).hooks).toBeTruthy()
  })
})

describe('setup guides', () => {
  it('has a complete guide for every provider', () => {
    expect(incompleteGuides()).toEqual([])
    expect(Object.keys(SETUP_GUIDES).sort()).toEqual([...PROVIDER_IDS].sort())
    for (const id of PROVIDER_IDS) {
      const g = SETUP_GUIDES[id]
      expect(g.consoleUrl).toMatch(/^https:\/\//)
      expect(g.steps.length).toBeGreaterThanOrEqual(3)
      expect(g.scopes.length).toBeGreaterThan(0)
      expect(g.appName.length).toBeGreaterThan(0)
      expect(g.scopes).toEqual(PROVIDERS[id].scopes)
    }
    expect(SETUP_GUIDES.apple.notes.join(' ')).toContain('apple-developer-domain-association')
    expect(SETUP_GUIDES.apple.steps.join(' ')).toContain('Return URL')
  })

  it('computes the redirect URL from the site origin', () => {
    expect(redirectUriFor('https://a.example.com', 'google')).toBe('https://a.example.com/api/social/google/callback')
    expect(redirectUriFor('https://b.example.org/', 'apple')).toBe('https://b.example.org/api/social/apple/callback')
    expect(guideFor('github', 'https://c.example.net').redirectUri).toBe('https://c.example.net/api/social/github/callback')
    const uris = new Set(PROVIDER_IDS.map((id) => redirectUriFor(ORIGIN, id)))
    expect(uris.size).toBe(6)
  })

  it('ships no credentials', () => {
    const everything = JSON.stringify(SETUP_GUIDES) + JSON.stringify(emptySocialConfig())
    expect(everything).not.toMatch(/client_secret|AIza|ghp_/)
    for (const id of PROVIDER_IDS) {
      expect(emptySocialConfig().providers[id]).toMatchObject({ enabled: false, clientId: '', clientSecret: '' })
    }
  })
})
