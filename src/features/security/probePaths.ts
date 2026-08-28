/**
 * Probe-path blocking, directory-listing prevention and fingerprint hiding -
 * the Hardening section.
 *
 * Worth being clear about what this is: noise reduction. There is no PHP here
 * and no `/wp-admin`, so a bot asking for them was never going to find
 * anything; blocking them keeps the logs readable and stops the scan from
 * costing a rendered 404 page each time. It is not a defence, and the settings
 * screen says so too.
 */

/**
 * Exact paths and prefixes that only automated scanners ever ask for.
 *
 * Deliberately conservative. Anything that could collide with a real page slug
 * a user might legitimately create is left out - blocking a path the owner
 * later needs is a far worse failure than letting a scanner see a 404.
 */
const PROBE_PREFIXES = [
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wp-json',
  '/wordpress',
  '/xmlrpc.php',
  '/wp-login.php',
  '/wp-config.php',
  '/.env',
  '/.git',
  '/.svn',
  '/.hg',
  '/.aws',
  '/.ssh',
  '/.vscode',
  '/.idea',
  '/vendor/phpunit',
  '/phpmyadmin',
  '/pma',
  '/adminer.php',
  '/cgi-bin',
  '/.well-known/acme-challenge/../',
  '/config.json',
  '/credentials',
  '/dump.sql',
  '/backup.sql',
  '/.DS_Store',
  '/server-status',
  '/actuator',
]

/** Suffixes no route here ever serves; asking for one is always a probe. */
const PROBE_SUFFIXES = ['.php', '.php5', '.phtml', '.asp', '.aspx', '.jsp', '.cgi', '.bak', '.old', '.swp', '.sql']

export function isProbePath(pathname: string): boolean {
  const path = pathname.toLowerCase()

  if (PROBE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix))) {
    return true
  }

  return PROBE_SUFFIXES.some((suffix) => path.endsWith(suffix))
}

/**
 * A request for a bare directory under the public asset roots.
 *
 * Workers does not generate indexes, so nothing is actually being listed
 * today - this closes the door before some future static handler opens it, and
 * makes the toggle mean something rather than being decorative.
 */
const LISTABLE_ROOTS = ['/media', '/uploads', '/assets', '/static', '/public', '/_next/static']

export function isDirectoryListingRequest(pathname: string): boolean {
  if (pathname === '/') return false
  if (!pathname.endsWith('/')) return false

  return LISTABLE_ROOTS.some((root) => pathname === `${root}/` || pathname.startsWith(`${root}/`))
}
