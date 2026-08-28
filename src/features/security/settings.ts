import type { FeatureKey } from '@/features/registry'

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
}

/** Mirrors the `defaultValue` of every field on the Security screen. */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  featureEnabled: true,
  loginProtection: {
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
    requireTwoFactorForAdmins: false,
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
  }
}
