/**
 * The configurable admin URL. Pure and edge-safe: the middleware, the server
 * code and the admin client all import the same rules from here.
 *
 * The owner sets `adminPath` on the Security screen. ENGAGE_ADMIN_PATH, when
 * set to a valid path, wins over the setting; it exists so an owner who forgets
 * the URL can recover from the Cloudflare dashboard without touching the DB.
 */

export const DEFAULT_ADMIN_PATH = '/admin'
export const ADMIN_PATH_ENV = 'ENGAGE_ADMIN_PATH'

export const ADMIN_PATH_MIN_LENGTH = 3
export const ADMIN_PATH_MAX_LENGTH = 40

/** Words a custom admin path may never be: they are routes of the site or the app itself. */
export const RESERVED_ADMIN_PATHS: readonly string[] = [
  'api',
  'shop',
  'blog',
  'cart',
  'checkout',
  'preview',
  'login',
  'logout',
  'events',
  'search',
  'faq',
  'embed',
  'feeds',
  'account',
  'portal',
  'maintenance',
  'maintenance-bypass',
  'visual-editor-canvas',
  'sitemap',
  'robots',
  'llms',
  'graphql',
  'media',
  'static',
  'assets',
  'fonts',
  'favicon',
  '_next',
  '_not-found',
  '.well-known',
]

const SEGMENT = /^[a-z0-9-]+$/

export type AdminPathError = 'format' | 'length' | 'reserved'

/** Trims whitespace and surrounding slashes, then adds exactly one leading slash. Empty input gives ''. */
export function normaliseAdminPath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const core = raw.trim().replace(/^\/+|\/+$/g, '')
  return core ? `/${core}` : ''
}

/**
 * Null when the path is a valid custom admin URL, otherwise the first rule it breaks.
 * Empty is not valid here; callers that treat empty as "use the default" check that first.
 */
export function validateAdminPath(raw: unknown): AdminPathError | null {
  const normalised = normaliseAdminPath(raw)
  const segment = normalised.slice(1)
  if (!SEGMENT.test(segment)) return 'format'
  if (segment.length < ADMIN_PATH_MIN_LENGTH || segment.length > ADMIN_PATH_MAX_LENGTH) return 'length'
  if (RESERVED_ADMIN_PATHS.includes(segment)) return 'reserved'
  return null
}

const usable = (raw: unknown): string | null => {
  const normalised = normaliseAdminPath(raw)
  return normalised && validateAdminPath(normalised) === null ? normalised : null
}

/**
 * The admin root to serve and link to. Env override first, then the saved
 * setting, then /admin. An invalid or empty value is skipped, so a bad value
 * can never make the admin unreachable.
 */
export function resolveAdminRoot(setting: unknown, env: unknown): string {
  return usable(env) ?? usable(setting) ?? DEFAULT_ADMIN_PATH
}

/** Joins the admin root with a path inside the admin: adminHref('/login', '/studio-7f3') gives '/studio-7f3/login'. */
export function adminHref(path = '', root: string = DEFAULT_ADMIN_PATH): string {
  const tail = path && path !== '/' ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `${root}${tail}`
}

/** True when the pathname is the admin root or inside it. */
export function isUnderAdminRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`)
}

/**
 * Moves a path written against /admin (the internal route) onto the configured
 * root. Paths outside /admin are returned unchanged.
 */
export function rebaseAdminPath(path: string, root: string): string {
  if (root === DEFAULT_ADMIN_PATH || !isUnderAdminRoot(path, DEFAULT_ADMIN_PATH)) return path
  return `${root}${path.slice(DEFAULT_ADMIN_PATH.length)}`
}
