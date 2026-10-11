/**
 * One canonical form of an email address for matching (per-customer coupon limits, one review per
 * person, reminder suppression). Lowercased and trimmed; a "+tag" is dropped from the local part, and
 * dots are dropped for Gmail addresses (which ignore them).
 */
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim().toLowerCase()
  const at = text.lastIndexOf('@')
  if (at < 1) return text
  let local = text.slice(0, at)
  let domain = text.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}
