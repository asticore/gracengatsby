import type { FeatureKey } from '@/features/registry'

import { DEFAULT_PASSWORD_POLICY, HISTORY_LIMIT, MAX_POLICY_LENGTH, type PasswordPolicy } from './passwordPolicyDefaults'

/**
 * The values behind the Security screen, in a shape the enforcement code can
 * use, plus the two ways of getting them.
 *
 * There are two readers on purpose. Server components and hooks run with the
 * engine available and go through `getSecuritySettings()`. The request
 * middleware does not - it has to answer in a fraction of a millisecond, on a
 * cold isolate, before anything heavy is loaded - so it goes through
 * `readSecuritySettingsFromD1()`, which is one indexed single-row SELECT held
 * in isolate memory for a minute. A settings change therefore takes up to a
 * minute to reach every isolate; that is the price of not paying a database
 * round trip on every request, and no setting here is a same-second concern.
 *
 * Every reader fails open to `DEFAULT_SECURITY_SETTINGS`. A database hiccup
 * must not be able to lock people out of their own admin area or blank the
 * response headers; the defaults are the safe ones.
 */

export type XFrameOption = 'DENY' | 'SAMEORIGIN'

export type SecuritySettings = {
  /** False when the Security feature is switched off in Site Settings. */
  featureEnabled: boolean
  loginProtection: {
    maxLoginAttempts: number
    lockoutMinutes: number
    requireTwoFactorForAdmins: boolean
    requireTwoFactorForMembers: boolean
    sessionTimeoutMinutes: number
  }
  headers: {
    hsts: boolean
    xFrameOptions: XFrameOption
    xContentTypeOptions: boolean
    referrerPolicy: string
    permissionsPolicy: string
    contentSecurityPolicy: string
  }
  rateLimiting: {
    enabled: boolean
    requestsPerMinute: number
    applyToApi: boolean
    applyToForms: boolean
  }
  hardening: {
    blockProbePaths: boolean
    disableDirectoryListing: boolean
    hideCmsFingerprint: boolean
  }
  auditLog: {
    enabled: boolean
    retentionDays: number
  }
  /** Password rules for customers and admins - see passwordPolicy.ts. */
  passwordPolicy: PasswordPolicy
  /** Emailed sign-in links and codes. Off unless the owner switches them on. */
  passwordless: PasswordlessSettings
  /** Passkeys (WebAuthn). Off unless the owner switches them on. See src/features/passkeys. */
  passkeys: PasskeySettings
  /** Per-user API keys (bearer tokens for the REST API). Off unless the owner switches them on. See src/features/apiKeys. */
  apiKeys: ApiKeySettings
  /** Admin "sign in as customer". Off unless the owner switches it on. See src/features/impersonation. */
  impersonation: ImpersonationSettings
}

export type ImpersonationSettings = {
  enabled: boolean
  /** Lifetime of an impersonated session, in minutes. Clamped to 5..120. */
  maxMinutes: number
  /** Admin must have two-step sign-in or a passkey before impersonating. */
  requireTwoFactor: boolean
}

export const DEFAULT_IMPERSONATION_SETTINGS: ImpersonationSettings = {
  enabled: false,
  maxMinutes: 30,
  requireTwoFactor: true,
}

export type ApiKeySettings = {
  enabled: boolean
  allowCustomers: boolean
  maxPerUser: number
  /** Longest lifetime a new key may have, in days. 0 means keys cannot carry an expiry date. */
  maxLifetimeDays: number
}

export const DEFAULT_API_KEY_SETTINGS: ApiKeySettings = {
  enabled: false,
  allowCustomers: false,
  maxPerUser: 5,
  maxLifetimeDays: 365,
}

export type PasskeySettings = {
  enabled: boolean
  allowAdmins: boolean
  /** Shown in the device prompt. Empty means the site name. */
  rpName: string
  userVerification: 'preferred' | 'required'
}

export const DEFAULT_PASSKEY_SETTINGS: PasskeySettings = {
  enabled: false,
  allowAdmins: false,
  rpName: '',
  userVerification: 'preferred',
}

export type PasswordlessSettings = {
  magicLinkEnabled: boolean
  emailCodeEnabled: boolean
  allowForAdmins: boolean
  tokenMinutes: number
}

export const DEFAULT_PASSWORDLESS_SETTINGS: PasswordlessSettings = {
  magicLinkEnabled: false,
  emailCodeEnabled: false,
  allowForAdmins: false,
  tokenMinutes: 15,
}

/** Mirrors the `defaultValue` of every field on the Security screen. */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  featureEnabled: false,
  loginProtection: {
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
    requireTwoFactorForAdmins: false,
    requireTwoFactorForMembers: false,
    sessionTimeoutMinutes: 720,
  },
  headers: {
    hsts: true,
    xFrameOptions: 'SAMEORIGIN',
    xContentTypeOptions: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: '',
    contentSecurityPolicy: '',
  },
  rateLimiting: {
    enabled: true,
    requestsPerMinute: 120,
    applyToApi: true,
    applyToForms: true,
  },
  hardening: {
    blockProbePaths: true,
    disableDirectoryListing: true,
    hideCmsFingerprint: false,
  },
  auditLog: {
    enabled: true,
    retentionDays: 90,
  },
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
  passwordless: DEFAULT_PASSWORDLESS_SETTINGS,
  passkeys: DEFAULT_PASSKEY_SETTINGS,
  apiKeys: DEFAULT_API_KEY_SETTINGS,
  impersonation: DEFAULT_IMPERSONATION_SETTINGS,
}

export const SECURITY_FEATURE_KEY: FeatureKey = 'security'

const SETTINGS_TABLE = 'eg_security_settings'
const SITE_SETTINGS_TABLE = 'eg_site_settings'

/** Cheap coercions: SQLite hands booleans back as 0/1 and numbers as strings. */
const asBool = (value: unknown, fallback: boolean): boolean =>
  value === null || value === undefined ? fallback : Boolean(Number(value) || value === true)

const asNum = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** A whole number within [min, max]. Zero is a real answer for the password settings, so it is not treated as missing. */
const asInt = (value: unknown, fallback: number, min: number, max: number): number => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/** Reads the eight flat password fields from any source that can look them up by column-style key. */
/** `password_min_length` to `passwordMinLength`: the engine hands back camelCase names. */
const camel = (key: string): string => key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())

export const passwordPolicyFrom = (get: (key: string) => unknown): PasswordPolicy => {
  const base = DEFAULT_PASSWORD_POLICY
  return {
    minLength: asInt(get('password_min_length'), base.minLength, 1, MAX_POLICY_LENGTH),
    requireMixedCase: asBool(get('password_require_mixed_case'), base.requireMixedCase),
    requireNumber: asBool(get('password_require_number'), base.requireNumber),
    requireSymbol: asBool(get('password_require_symbol'), base.requireSymbol),
    blockCommon: asBool(get('password_block_common'), base.blockCommon),
    breachCheck: asBool(get('password_breach_check'), base.breachCheck),
    historyCount: asInt(get('password_history_count'), base.historyCount, 0, HISTORY_LIMIT),
    maxAgeDays: asInt(get('password_max_age_days'), base.maxAgeDays, 0, 3650),
  }
}

/** Reads the four passkey fields; `get` takes the camelCase name the engine uses. */
export const passkeysFrom = (get: (key: string) => unknown): PasskeySettings => {
  const base = DEFAULT_PASSKEY_SETTINGS
  const rp = get('passkeys_rp_name')
  const uv = get('passkeys_user_verification')
  return {
    enabled: asBool(get('passkeys_enabled'), base.enabled),
    allowAdmins: asBool(get('passkeys_allow_admins'), base.allowAdmins),
    rpName: typeof rp === 'string' ? rp.trim().slice(0, 80) : base.rpName,
    userVerification: uv === 'required' ? 'required' : 'preferred',
  }
}

/** Reads the four API key fields; `get` takes the camelCase name the engine uses. */
export const apiKeysFrom = (get: (key: string) => unknown): ApiKeySettings => {
  const base = DEFAULT_API_KEY_SETTINGS
  return {
    enabled: asBool(get('api_keys_enabled'), base.enabled),
    allowCustomers: asBool(get('api_keys_allow_customers'), base.allowCustomers),
    maxPerUser: asInt(get('api_keys_max_per_user'), base.maxPerUser, 1, 50),
    maxLifetimeDays: asInt(get('api_keys_max_lifetime_days'), base.maxLifetimeDays, 0, 3650),
  }
}

/**
 * Reads the three impersonation fields. `get` takes the column name
 * (`impersonation_enabled`, `impersonation_max_minutes`, `impersonation_require2fa`).
 * Minutes are clamped to 5..120 here, so no reader can ever hand back a longer lifetime.
 */
export const impersonationFrom = (get: (column: string) => unknown): ImpersonationSettings => {
  const base = DEFAULT_IMPERSONATION_SETTINGS
  return {
    enabled: asBool(get('impersonation_enabled'), base.enabled),
    maxMinutes: asInt(get('impersonation_max_minutes'), base.maxMinutes, 5, 120),
    requireTwoFactor: asBool(get('impersonation_require2fa'), base.requireTwoFactor),
  }
}

/** Maps each impersonation column to the global field the engine returns it under. */
const IMPERSONATION_GLOBAL_KEYS: Record<string, string> = {
  impersonation_enabled: 'impersonationEnabled',
  impersonation_max_minutes: 'impersonationMaxMinutes',
  impersonation_require2fa: 'impersonationRequire2fa',
}

/** Reads the four passwordless fields; `get` takes the camelCase name the engine uses. */
export const passwordlessFrom = (get: (key: string) => unknown): PasswordlessSettings => {
  const base = DEFAULT_PASSWORDLESS_SETTINGS
  return {
    magicLinkEnabled: asBool(get('magic_link_enabled'), base.magicLinkEnabled),
    emailCodeEnabled: asBool(get('email_code_enabled'), base.emailCodeEnabled),
    allowForAdmins: asBool(get('allow_passwordless_for_admins'), base.allowForAdmins),
    tokenMinutes: asInt(get('passwordless_token_minutes'), base.tokenMinutes, 5, 60),
  }
}

const asText = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback

type SettingsRow = Record<string, unknown>

/** Maps one flat settings row onto the nested shape, field by field. */
export function rowToSettings(row: SettingsRow | null, featureEnabled: boolean): SecuritySettings {
  const base = DEFAULT_SECURITY_SETTINGS
  if (!row) return { ...base, featureEnabled }

  const frame = asText(row.headers_x_frame_options, base.headers.xFrameOptions)

  return {
    featureEnabled,
    loginProtection: {
      maxLoginAttempts: asNum(row.login_protection_max_login_attempts, base.loginProtection.maxLoginAttempts),
      lockoutMinutes: asNum(row.login_protection_lockout_minutes, base.loginProtection.lockoutMinutes),
      requireTwoFactorForAdmins: asBool(
        row.login_protection_require_two_factor_for_admins,
        base.loginProtection.requireTwoFactorForAdmins,
      ),
      requireTwoFactorForMembers: asBool(
        row.login_protection_require_two_factor_for_members,
        base.loginProtection.requireTwoFactorForMembers,
      ),
      sessionTimeoutMinutes: asNum(
        row.login_protection_session_timeout_minutes,
        base.loginProtection.sessionTimeoutMinutes,
      ),
    },
    headers: {
      hsts: asBool(row.headers_hsts, base.headers.hsts),
      xFrameOptions: frame === 'DENY' ? 'DENY' : 'SAMEORIGIN',
      xContentTypeOptions: asBool(row.headers_x_content_type_options, base.headers.xContentTypeOptions),
      referrerPolicy: asText(row.headers_referrer_policy, base.headers.referrerPolicy),
      permissionsPolicy: asText(row.headers_permissions_policy, base.headers.permissionsPolicy),
      contentSecurityPolicy: asText(row.headers_content_security_policy, base.headers.contentSecurityPolicy),
    },
    rateLimiting: {
      enabled: asBool(row.rate_limiting_enabled, base.rateLimiting.enabled),
      requestsPerMinute: asNum(row.rate_limiting_requests_per_minute, base.rateLimiting.requestsPerMinute),
      applyToApi: asBool(row.rate_limiting_apply_to_api, base.rateLimiting.applyToApi),
      applyToForms: asBool(row.rate_limiting_apply_to_forms, base.rateLimiting.applyToForms),
    },
    hardening: {
      blockProbePaths: asBool(row.hardening_block_probe_paths, base.hardening.blockProbePaths),
      disableDirectoryListing: asBool(row.hardening_disable_directory_listing, base.hardening.disableDirectoryListing),
      hideCmsFingerprint: asBool(row.hardening_hide_cms_fingerprint, base.hardening.hideCmsFingerprint),
    },
    auditLog: {
      enabled: asBool(row.audit_log_enabled, base.auditLog.enabled),
      retentionDays: asNum(row.audit_log_retention_days, base.auditLog.retentionDays),
    },
    passwordPolicy: passwordPolicyFrom((key) => row[key]),
    passwordless: passwordlessFrom((key) => row[key]),
    passkeys: passkeysFrom((key) => row[key]),
    apiKeys: apiKeysFrom((key) => row[key]),
    impersonation: impersonationFrom((key) => row[key]),
  }
}

// --- Middleware-side reader -------------------------------------------------

const CACHE_TTL_MS = 60_000

let cached: { at: number; value: SecuritySettings } | null = null

/**
 * Resolves the D1 binding without making the module depend on it at import
 * time. The middleware bundle is built for the edge and is loaded on paths
 * (local `next dev`, tests) where no binding exists at all, so the whole thing
 * is behind a dynamic import and a catch.
 */
async function getD1(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return context?.env?.D1 ?? null
  } catch {
    return null
  }
}

export async function readSecuritySettingsFromD1(): Promise<SecuritySettings> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value

  let value = DEFAULT_SECURITY_SETTINGS

  try {
    const db = await getD1()
    if (db) {
      const settings = await db.prepare(`SELECT * FROM \`${SETTINGS_TABLE}\` LIMIT 1`).all()
      const flags = await db
        .prepare(`SELECT features_security FROM \`${SITE_SETTINGS_TABLE}\` LIMIT 1`)
        .all()

      const flagRow = flags.results?.[0] as SettingsRow | undefined
      value = rowToSettings(
        (settings.results?.[0] as SettingsRow) ?? null,
        asBool(flagRow?.features_security, DEFAULT_SECURITY_SETTINGS.featureEnabled),
      )
    }
  } catch {
    // Fails open: a missing table on a half-migrated database must not take
    // every request down. The defaults are the shipped-safe values.
    value = DEFAULT_SECURITY_SETTINGS
  }

  cached = { at: now, value }
  return value
}

/** Drops the isolate's copy so the next request re-reads. Called after a save. */
export function invalidateSecuritySettingsCache(): void {
  cached = null
}

// --- Engine-side reader -----------------------------------------------------

type EngineLike = {
  findGlobal: (args: { slug: string; depth?: number }) => Promise<Record<string, unknown>>
}

/**
 * Reads the same values through the engine, for code that already has it -
 * hooks, server components, the audit writer. Nested groups come back as real
 * objects here, so this does not go through `rowToSettings`.
 */
export async function getSecuritySettings(engine: EngineLike): Promise<SecuritySettings> {
  const base = DEFAULT_SECURITY_SETTINGS

  const [settings, site] = await Promise.all([
    engine.findGlobal({ slug: 'security-settings', depth: 0 }).catch((): null => null),
    engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null),
  ])

  if (!settings) return base

  const group = <T,>(name: string): Partial<T> => ((settings[name] ?? {}) as Partial<T>)

  const login = group<SecuritySettings['loginProtection']>('loginProtection')
  const headers = group<SecuritySettings['headers']>('headers')
  const rate = group<SecuritySettings['rateLimiting']>('rateLimiting')
  const hardening = group<SecuritySettings['hardening']>('hardening')
  const audit = group<SecuritySettings['auditLog']>('auditLog')

  const features = (site?.features ?? {}) as Record<string, boolean | null | undefined>

  return {
    featureEnabled: features[SECURITY_FEATURE_KEY] ?? base.featureEnabled,
    loginProtection: {
      maxLoginAttempts: asNum(login.maxLoginAttempts, base.loginProtection.maxLoginAttempts),
      lockoutMinutes: asNum(login.lockoutMinutes, base.loginProtection.lockoutMinutes),
      requireTwoFactorForAdmins: asBool(
        login.requireTwoFactorForAdmins,
        base.loginProtection.requireTwoFactorForAdmins,
      ),
      requireTwoFactorForMembers: asBool(
        login.requireTwoFactorForMembers,
        base.loginProtection.requireTwoFactorForMembers,
      ),
      sessionTimeoutMinutes: asNum(login.sessionTimeoutMinutes, base.loginProtection.sessionTimeoutMinutes),
    },
    headers: {
      hsts: asBool(headers.hsts, base.headers.hsts),
      xFrameOptions: headers.xFrameOptions === 'DENY' ? 'DENY' : 'SAMEORIGIN',
      xContentTypeOptions: asBool(headers.xContentTypeOptions, base.headers.xContentTypeOptions),
      referrerPolicy: asText(headers.referrerPolicy, base.headers.referrerPolicy),
      permissionsPolicy: asText(headers.permissionsPolicy, base.headers.permissionsPolicy),
      contentSecurityPolicy: asText(headers.contentSecurityPolicy, base.headers.contentSecurityPolicy),
    },
    rateLimiting: {
      enabled: asBool(rate.enabled, base.rateLimiting.enabled),
      requestsPerMinute: asNum(rate.requestsPerMinute, base.rateLimiting.requestsPerMinute),
      applyToApi: asBool(rate.applyToApi, base.rateLimiting.applyToApi),
      applyToForms: asBool(rate.applyToForms, base.rateLimiting.applyToForms),
    },
    hardening: {
      blockProbePaths: asBool(hardening.blockProbePaths, base.hardening.blockProbePaths),
      disableDirectoryListing: asBool(hardening.disableDirectoryListing, base.hardening.disableDirectoryListing),
      hideCmsFingerprint: asBool(hardening.hideCmsFingerprint, base.hardening.hideCmsFingerprint),
    },
    auditLog: {
      enabled: asBool(audit.enabled, base.auditLog.enabled),
      retentionDays: asNum(audit.retentionDays, base.auditLog.retentionDays),
    },
    passwordPolicy: passwordPolicyFrom((key) => (settings as Record<string, unknown>)[camel(key)]),
    passwordless: passwordlessFrom((key) => (settings as Record<string, unknown>)[camel(key)]),
    passkeys: passkeysFrom((key) => (settings as Record<string, unknown>)[camel(key)]),
    apiKeys: apiKeysFrom((key) => (settings as Record<string, unknown>)[camel(key)]),
    impersonation: impersonationFrom((key) => (settings as Record<string, unknown>)[IMPERSONATION_GLOBAL_KEYS[key] ?? key]),
  }
}
