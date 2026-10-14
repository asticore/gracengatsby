/** Text and link safety for imported HTML: shortcodes are removed, unsafe link addresses are dropped. */

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

/** Shortcodes look like [name], [name attr="x"] or [/name]. Only lower-case names, so "[Read more]" stays. */
export function stripShortcodes(text: string): string {
  return text.replace(/\[\/?[a-z][a-z0-9_-]*(?:\s[^[\]]*)?\]/g, '')
}

/** Returns the address when it is safe to link to, otherwise null. */
export function safeUrl(raw: string | undefined): string | null {
  const url = (raw ?? '').trim()
  if (!url) return null
  const compact = url.replace(/[\x00-\x20]/g, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)
  if (scheme) return SAFE_SCHEMES.has(scheme[1]) ? url : null
  return url
}
