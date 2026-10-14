/**
 * Plain-English formatting for the health and scheduled task screens. Pure:
 * the time zone is passed in, and a bad or missing zone falls back to UTC
 * instead of throwing.
 */

/** A timestamp as "14 Oct 2026, 9:05 am" in the site's time zone. "Never" when missing or unreadable. */
export function formatWhen(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return 'Never'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'Unknown'
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
  try {
    return at.toLocaleString('en-AU', { ...options, timeZone: timeZone || 'UTC' })
  } catch {
    return at.toLocaleString('en-AU', { ...options, timeZone: 'UTC' })
  }
}

/** A duration as "850 ms" or "2.4 s". Null when unknown. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** "5 minutes ago", "3 hours ago" or "2 days ago" for a timestamp. "Never" when missing. */
export function formatAgo(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'Never'
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return 'Unknown'
  const minutes = Math.max(0, Math.round((now.getTime() - at) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} days ago`
}

/** "12.5%" with the number shown as a plain percentage. Null when there is no figure. */
export function formatPercent(value: number | null): string {
  return value === null ? 'Unknown' : `${value}%`
}