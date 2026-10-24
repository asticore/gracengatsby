/**
 * The six sign-in providers: endpoints, scopes and what each one needs before
 * it may be used. Plain data and pure helpers - no I/O - so the settings
 * screen, the routes and the tests all read the same facts.
 */

export const PROVIDER_IDS = ['google', 'github', 'apple', 'facebook', 'microsoft', 'discord'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)

/** One provider's saved settings. Secrets are decrypted; server use only. */
export type ProviderConfig = {
  enabled: boolean
  clientId: string
  clientSecret: string
  teamId: string
  keyId: string
  privateKey: string
  tenant: string
  redirectConfirmed: boolean
}

export type SocialConfig = {
  allowSignupViaSocial: boolean
  allowAdminSocialLogin: boolean
  providers: Record<ProviderId, ProviderConfig>
}

export type OidcInfo = {
  jwksUrl: string
  /** True when the token's `iss` claim is acceptable for this provider and config. */
  issuerOk: (iss: string, claims: Record<string, unknown>, cfg: ProviderConfig) => boolean
}

export type ProviderDef = {
  id: ProviderId
  label: string
  scopes: string[]
  pkce: boolean
  oidc: OidcInfo | null
  authUrl: (cfg: ProviderConfig) => string
  tokenUrl: (cfg: ProviderConfig) => string
  /** Extra authorize-URL parameters. */
  authParams: Record<string, string>
}

const MS_PERSONAL_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

export const DEFAULT_MICROSOFT_TENANT = 'common'

/** A tenant is "common", "organizations", "consumers", a GUID or a domain - never anything that could alter the URL path. */
export const safeTenant = (value: string): string => {
  const tenant = (value || '').trim()
  return /^[A-Za-z0-9.-]{1,100}$/.test(tenant) ? tenant : DEFAULT_MICROSOFT_TENANT
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  google: {
    id: 'google',
    label: 'Google',
    scopes: ['openid', 'email', 'profile'],
    pkce: true,
    oidc: {
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      issuerOk: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
    },
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    authParams: { prompt: 'select_account' },
  },
  github: {
    id: 'github',
    label: 'GitHub',
    scopes: ['read:user', 'user:email'],
    pkce: true,
    oidc: null,
    authUrl: () => 'https://github.com/login/oauth/authorize',
    tokenUrl: () => 'https://github.com/login/oauth/access_token',
    authParams: {},
  },
  apple: {
    id: 'apple',
    label: 'Apple',
    scopes: ['name', 'email'],
    // Apple's PKCE support is not documented; state + nonce + the signed cookie cover the same ground.
    pkce: false,
    oidc: {
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuerOk: (iss) => iss === 'https://appleid.apple.com',
    },
    authUrl: () => 'https://appleid.apple.com/auth/authorize',
    tokenUrl: () => 'https://appleid.apple.com/auth/token',
    authParams: { response_mode: 'form_post' },
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    scopes: ['email', 'public_profile'],
    pkce: false,
    oidc: null,
    authUrl: () => 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: () => 'https://graph.facebook.com/v19.0/oauth/access_token',
    authParams: {},
  },
  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',
    scopes: ['openid', 'email', 'profile'],
    pkce: true,
    oidc: {
      jwksUrl: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
      // The issuer carries the signing tenant's id, which is in the token's own `tid`. A fixed tenant must match it.
      issuerOk: (iss, claims, cfg) => {
        const tid = typeof claims.tid === 'string' ? claims.tid : ''
        if (!tid || iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return false
        const tenant = safeTenant(cfg.tenant).toLowerCase()
        if (tenant === 'common') return true
        if (tenant === 'organizations') return tid !== MS_PERSONAL_TENANT
        if (tenant === 'consumers') return tid === MS_PERSONAL_TENANT
        return tid.toLowerCase() === tenant
      },
    },
    authUrl: (cfg) => `https://login.microsoftonline.com/${safeTenant(cfg.tenant)}/oauth2/v2.0/authorize`,
    tokenUrl: (cfg) => `https://login.microsoftonline.com/${safeTenant(cfg.tenant)}/oauth2/v2.0/token`,
    authParams: { prompt: 'select_account' },
  },
  discord: {
    id: 'discord',
    label: 'Discord',
    scopes: ['identify', 'email'],
    pkce: true,
    oidc: null,
    authUrl: () => 'https://discord.com/oauth2/authorize',
    tokenUrl: () => 'https://discord.com/api/oauth2/token',
    authParams: {},
  },
}

export { MS_PERSONAL_TENANT }

export const emptyProviderConfig = (): ProviderConfig => ({
  enabled: false,
  clientId: '',
  clientSecret: '',
  teamId: '',
  keyId: '',
  privateKey: '',
  tenant: DEFAULT_MICROSOFT_TENANT,
  redirectConfirmed: false,
})

export const emptySocialConfig = (): SocialConfig => ({
  allowSignupViaSocial: true,
  allowAdminSocialLogin: false,
  providers: {
    google: emptyProviderConfig(),
    github: emptyProviderConfig(),
    apple: emptyProviderConfig(),
    facebook: emptyProviderConfig(),
    microsoft: emptyProviderConfig(),
    discord: emptyProviderConfig(),
  },
})

/** The credentials a provider cannot work without, as [settings key, plain label]. */
export const REQUIRED_CREDENTIALS: Record<ProviderId, Array<[keyof ProviderConfig, string]>> = {
  google: [['clientId', 'client ID'], ['clientSecret', 'client secret']],
  github: [['clientId', 'client ID'], ['clientSecret', 'client secret']],
  facebook: [['clientId', 'app ID'], ['clientSecret', 'app secret']],
  discord: [['clientId', 'client ID'], ['clientSecret', 'client secret']],
  microsoft: [['clientId', 'application (client) ID'], ['clientSecret', 'client secret value']],
  apple: [['clientId', 'Services ID'], ['teamId', 'Team ID'], ['keyId', 'Key ID'], ['privateKey', 'private key (.p8)']],
}

/** Plain-English names of the credentials still missing for a provider. Empty means complete. */
export const missingCredentials = (id: ProviderId, cfg: ProviderConfig): string[] =>
  REQUIRED_CREDENTIALS[id].filter(([key]) => !String(cfg[key] ?? '').trim()).map(([, label]) => label)

export const hasCredentials = (id: ProviderId, cfg: ProviderConfig): boolean => missingCredentials(id, cfg).length === 0

/** Fail closed: usable only when switched on AND every credential is saved. */
export const isUsable = (id: ProviderId, cfg: ProviderConfig): boolean => cfg.enabled === true && hasCredentials(id, cfg)

/** The exact callback address to register with the provider for a site origin. */
export const redirectUriFor = (origin: string, id: ProviderId): string => `${origin.replace(/\/+$/, '')}/api/social/${id}/callback`
