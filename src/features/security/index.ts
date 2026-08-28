/**
 * Public surface of the Security feature. Everything outside this folder
 * imports from here, so the internal file layout can change without touching
 * the integration points.
 */

export {
  DEFAULT_SECURITY_SETTINGS,
  SECURITY_FEATURE_KEY,
  getSecuritySettings,
  invalidateSecuritySettingsCache,
  readSecuritySettingsFromD1,
  rowToSettings,
  type SecuritySettings,
  type XFrameOption,
} from './settings'

export {
  DEFAULT_CONTENT_SECURITY_POLICY,
  FINGERPRINT_HEADERS,
  isPolicyFreePath,
  securityHeaders,
  type HeaderMap,
} from './headers'

export { isDirectoryListingRequest, isProbePath } from './probePaths'

export {
  classifyRoute,
  clientKey,
  hit,
  limitFor,
  resetRateLimiter,
  type RateLimitDecision,
  type RouteClass,
} from './rateLimit'

export {
  SESSION_COOKIE,
  isSessionExpired,
  loginProtectionAuth,
  loginProtectionDrift,
  tokenIssuedAt,
  type LoginProtectionAuth,
} from './loginProtection'

export {
  assertTwoFactorSatisfied,
  base32Decode,
  base32Encode,
  enrolTwoFactor,
  twoFactorFields,
  twoFactorStatus,
  verifyTotp,
  type TwoFactorStatus,
  type TwoFactorUser,
} from './twoFactor'

export {
  AUDIT_TABLE,
  audit,
  auditContext,
  maybePruneAuditLog,
  pruneAuditLog,
  recordAuditEvent,
  type AuditAction,
  type AuditEntry,
} from './auditLog'

export { AuditLog } from './auditLogCollection'

export {
  auditAfterChange,
  auditAfterDelete,
  auditAfterLogin,
  auditGlobalAfterChange,
} from './hooks'

export { applySecurityHeaders, securityMiddleware } from './requestGuard'
