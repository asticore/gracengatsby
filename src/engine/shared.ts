/**
 * Engine seam: shared constants and URL helpers used by the admin views.
 *
 * Hand-written (no vendor import): `PREFERENCE_KEYS` are the `payload-preferences`
 * keys this admin reads/writes, and `formatAdminURL` joins the admin route and
 * a path (optionally against a serverURL origin) the same way the previous
 * vendor helper did for this app's call sites.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export const PREFERENCE_KEYS = {
  BROWSE_BY_FOLDER: 'browse-by-folder',
  DASHBOARD_LAYOUT: 'dashboard-layout',
  NAV: 'nav',
} as const

export const formatAdminURL = (args: {
  adminRoute?: string
  apiRoute?: string
  basePath?: string
  includeBasePath?: boolean
  path?: string
  relative?: boolean
  serverURL?: string
}): string => {
  const { adminRoute, apiRoute, includeBasePath: includeBasePathArg, path = '', relative = false, serverURL } = args
  const basePath = process.env.NEXT_BASE_PATH || args.basePath || ''
  const routePath = adminRoute || apiRoute
  const segments = [routePath && routePath !== '/' && routePath, path && path].filter(Boolean)
  const pathname = segments.join('') || '/'
  const pathnameWithBase = (basePath + pathname).replace(/\/$/, '') || '/'
  const includeBasePath = includeBasePathArg ?? (adminRoute ? false : true)

  if (relative || !serverURL) {
    if (includeBasePath && basePath) return pathnameWithBase
    return pathname
  }

  return new URL(pathnameWithBase, new URL(serverURL).origin).toString()
}
