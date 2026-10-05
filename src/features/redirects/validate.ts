/**
 * Validation logic for redirects.
 * Pure functions with no I/O.
 */

export type RedirectType = '301' | '302' | '307' | '308'

export interface ValidateInput {
  fromPath: string
  toPath: string
  redirectType: string
}

export interface ExistingRedirect {
  id?: number
  fromPath: string
  toPath: string
  enabled: boolean
}

/**
 * Normalize a path for consistent comparison.
 * - Trim whitespace
 * - Ensure leading '/'
 * - Strip trailing slash (except for root '/')
 * - Drop URL fragments (#...) and query strings (?...)
 */
export function normalizePath(p: string): string {
  const trimmed = p.trim()

  // Strip fragment and query
  const baseUrl = trimmed.split(/[#?]/)[0]

  // Ensure leading slash
  let normalized = baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl

  // Strip trailing slash except for root
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

const RESERVED_PATHS = ['/admin', '/api', '/_next']
const RESERVED_PREFIXES = ['/admin/', '/api/', '/_next/']

/**
 * Check if a path starts with any reserved prefix
 */
function startsWithReserved(path: string): boolean {
  return RESERVED_PREFIXES.some(prefix => path.startsWith(prefix)) || RESERVED_PATHS.includes(path)
}

/**
 * Validate a redirect configuration.
 * Returns an array of error messages; empty array means valid.
 */
export function validateRedirect(
  input: ValidateInput,
  existing: ExistingRedirect[] = [],
  selfId?: number,
): string[] {
  const errors: string[] = []

  const normalizedFrom = normalizePath(input.fromPath)
  const normalizedToRaw = input.toPath.trim()
  const normalizedTo = normalizePath(input.toPath)

  // fromPath must start with '/' (check raw input first)
  if (!input.fromPath.trim().startsWith('/')) {
    errors.push('fromPath must start with "/"')
  }

  // fromPath must not be reserved
  if (startsWithReserved(normalizedFrom)) {
    errors.push('fromPath cannot be "/admin", start with "/admin/", "/api/" or "/_next/"')
  }

  // toPath must start with '/', 'http://', or 'https://'
  if (!normalizedToRaw.startsWith('/') && !normalizedToRaw.startsWith('http://') && !normalizedToRaw.startsWith('https://')) {
    errors.push('toPath must start with "/" or "http://" or "https://"')
  }

  // '//host' and '/\\host' are protocol-relative: browsers treat them as another site (open redirect).
  if (normalizedToRaw.startsWith('//') || normalizedToRaw.startsWith('/\\')) {
    errors.push('toPath must be a single-slash path or a full http(s) URL, not "//host"')
  }

  // Validate redirectType
  const validTypes: RedirectType[] = ['301', '302', '307', '308']
  if (!validTypes.includes(input.redirectType as RedirectType)) {
    errors.push('redirectType must be one of: 301, 302, 307, 308')
  }

  // For path targets, check loop: from equals to after normalization
  const isPathTarget = normalizedToRaw.startsWith('/')
  if (isPathTarget && normalizedFrom === normalizedTo) {
    errors.push('fromPath and toPath cannot be the same')
  }

  // Check for duplicate fromPath (normalized), excluding selfId
  const duplicateExisting = existing.find(
    r => normalizePath(r.fromPath) === normalizedFrom && r.id !== selfId,
  )
  if (duplicateExisting) {
    errors.push(`fromPath "${normalizedFrom}" is already in use`)
  }

  // For path targets only: check redirect chains
  if (isPathTarget) {
    // The record being edited is replaced by the new values, so its old row must not count.
    const enabledRedirects = existing.filter(
      r => r.enabled && r.id !== selfId && normalizePath(r.toPath).startsWith('/'),
    )

    // Check if chain starting from toPath can reach fromPath (loop detection)
    if (canReachPath(normalizedTo, normalizedFrom, enabledRedirects)) {
      errors.push('Redirect chain would create a loop')
    }

    // Longest chain through the new redirect: hops leading in + this one + hops leading out, max 5.
    const chainLength =
      getIncomingLength(normalizedFrom, enabledRedirects) + 1 + getChainLength(normalizedTo, enabledRedirects)
    if (chainLength > 5) {
      errors.push('Redirect chain exceeds maximum length of 5 hops')
    }
  }

  return errors
}

/**
 * Check if following enabled redirects from startPath leads to:
 * 1. A loop (cycle in the chain), OR
 * 2. Back to targetPath (which would create a loop when combined with new redirect)
 */
function canReachPath(startPath: string, targetPath: string, redirects: ExistingRedirect[]): boolean {
  const visited = new Set<string>()
  let current = startPath

  for (let i = 0; i < 10; i++) {
    if (visited.has(current)) {
      // Found a loop/cycle - this is problematic
      return true
    }

    visited.add(current)

    // Check if we've reached the target (which would create a loop with new redirect)
    if (current === targetPath && visited.size > 1) {
      return true
    }

    const next = redirects.find(r => normalizePath(r.fromPath) === current)
    if (!next) {
      break
    }

    current = normalizePath(next.toPath)
  }

  return false
}

/**
 * Get the length of the redirect chain starting from a path
 */
function getChainLength(startPath: string, redirects: ExistingRedirect[]): number {
  const visited = new Set<string>()
  let current = startPath
  let length = 0

  while (!visited.has(current)) {
    visited.add(current)

    const next = redirects.find(r => normalizePath(r.fromPath) === current)
    if (!next || !next.enabled) {
      break
    }

    current = normalizePath(next.toPath)
    length++

    // Limit to prevent infinite loop in validation
    if (visited.size > 6) {
      break
    }
  }

  return length
}

/**
 * Longest run of redirects that already lead INTO a path (reverse walk, cycle-safe).
 */
function getIncomingLength(path: string, redirects: ExistingRedirect[]): number {
  const walk = (current: string, seen: Set<string>): number => {
    if (seen.size > 6) return 0
    let best = 0
    for (const r of redirects) {
      if (normalizePath(r.toPath) !== current) continue
      const from = normalizePath(r.fromPath)
      if (seen.has(from)) continue
      const next = new Set(seen)
      next.add(from)
      best = Math.max(best, 1 + walk(from, next))
    }
    return best
  }
  return walk(path, new Set([path]))
}
