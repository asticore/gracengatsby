/**
 * Admin impersonation ("sign in as customer"). The rules are in policy.ts and
 * service.ts, which are pure and tested without a database. The database and
 * engine wiring is in store.ts and actions.ts, which are server-only.
 */
export {
  ADMIN_SESSION_COOKIE,
  IMPERSONATION_COOKIE,
  MAX_MINUTES,
  MIN_MINUTES,
  MIN_REASON_LENGTH,
  REFUSAL_MESSAGES,
  REFUSED_WHILE_IMPERSONATING,
  clampMinutes,
  cookieValue,
  headersForCustomerView,
  isImpersonating,
  normaliseReason,
  preflight,
  refuseWhileImpersonating,
  sessionSecondsFor,
  targetProblem,
  unverifiedClaims,
  type Refusal,
} from './policy'
export {
  impersonationHistory,
  impersonationIdFromClaims,
  startImpersonation,
  stopImpersonation,
  type HistoryEntry,
  type ImpersonationDeps,
  type ImpersonationRow,
  type ImpersonationStore,
  type TargetAccount,
} from './service'
