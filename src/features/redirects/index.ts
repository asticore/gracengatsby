/**
 * Redirects feature - public API
 */

export {
  normalizePath,
  validateRedirect,
  type RedirectType,
  type ValidateInput,
  type ExistingRedirect,
} from './validate'

export {
  resolveRedirect,
  recordRedirectHit,
  invalidateRedirectsCache,
  __setD1ForTests,
} from './resolve'
