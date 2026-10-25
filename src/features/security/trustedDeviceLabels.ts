/**
 * Edge-safe copies of the two display helpers in userSessions.ts (which imports node crypto and so
 * cannot be loaded by the middleware bundle). Same output: "Chrome on Windows", and an address with
 * its last part dropped.
 */

export function deviceLabelOf(userAgent: string | null | undefined): string {
  const ua = typeof userAgent === 'string' ? userAgent : ''
  if (!ua) return 'Unknown device'
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  const system = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return system ? `${browser} on ${system}` : browser
}

export function coarseIpOf(ip: string | null | undefined): string | null {
  const value = typeof ip === 'string' ? ip.trim() : ''
  if (!value) return null
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(value)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`
  if (value.includes(':')) {
    const head = value.split(':').slice(0, 3).filter((group) => /^[0-9a-fA-F]{0,4}$/.test(group))
    return head.length > 0 ? `${head.join(':')}::` : null
  }
  return null
}
