/**
 * Host names for multiple-domain routing. Pure: no I/O and no node-only imports, so the
 * edge middleware, the admin validation and the tests share one rule set.
 *
 * A domain is a bare host name: `example.com.au`, lower case, no scheme, port, path,
 * query, credentials or wildcard. Anything else is refused with a reason the admin can read.
 */

export type HostResult = { ok: true; host: string } | { ok: false; reason: string }

/** Labels per RFC 1035: letters, digits and hyphens, no leading or trailing hyphen. The TLD must contain a letter, which rules out IP addresses. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOST_PATTERN = new RegExp(`^(?:${LABEL}\\.)+(?:xn--[a-z0-9-]{2,59}|[a-z]{2,63})$`)

export const MAX_HOST_LENGTH = 253

/**
 * Turns what an admin typed into a canonical host, or says why it cannot be one.
 * `https://Example.com/` becomes `example.com`; `example.com:8080`, `*.example.com` and `localhost` are refused.
 */
export function normaliseHost(input: unknown): HostResult {
  if (typeof input !== 'string') return { ok: false, reason: 'Enter a domain name.' }
  let value = input.trim().toLowerCase()
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.replace(/[/?#].*$/, '')
  if (value.endsWith('.')) value = value.slice(0, -1)
  if (!value) return { ok: false, reason: 'Enter a domain name.' }
  if (value.includes('@')) return { ok: false, reason: 'Remove the user name before the domain.' }
  if (value.includes(':')) return { ok: false, reason: 'Leave out the port number. Domains use the standard ports.' }
  if (value.includes('*')) return { ok: false, reason: 'Wildcard domains are not supported. Add each host name.' }
  if (value.length > MAX_HOST_LENGTH) return { ok: false, reason: 'That domain name is too long.' }
  if (!HOST_PATTERN.test(value)) return { ok: false, reason: `"${value}" is not a valid domain name.` }
  return { ok: true, host: value }
}

/**
 * The host a request arrived on, from its Host header. Lower-cased, with any port and trailing dot removed,
 * so it compares equal to a normalised configured host.
 */
export function hostFromHeader(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}
