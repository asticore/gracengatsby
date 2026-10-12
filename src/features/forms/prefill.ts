import type { FormFieldDef } from './types'

/**
 * Pre-filling fields from the page address (?plan=pro&utm_source=news).
 *
 * Only a field that names a `prefillKey` AND whose key is on the form's
 * whitelist is ever filled, so a crafted link cannot write into fields the
 * author did not open up (a price, a hidden flag). Values are bounded and
 * choice fields must match a real option. This runs on the server so the
 * values arrive in the first HTML; the browser only displays them.
 */

const MAX_PREFILL_LENGTH = 500

export function computePrefill(
  fields: FormFieldDef[],
  whitelist: string[] | undefined,
  query: Record<string, string | string[] | undefined> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {}
  if (!query || !whitelist || whitelist.length === 0) return result
  const allowed = new Set(whitelist)

  for (const field of fields || []) {
    const key = field.prefillKey
    if (!field.name || !key || !allowed.has(key)) continue
    // Calculations, file uploads, signatures and the like have no sensible text prefill.
    if (['calculation', 'file', 'signature', 'matrix', 'address', 'appointment', 'payment', 'html', 'section', 'page'].includes(field.type || '')) continue
    const raw = query[key]
    const value = (Array.isArray(raw) ? raw[0] : raw)
    if (typeof value !== 'string' || !value.trim()) continue
    const text = value.trim().slice(0, MAX_PREFILL_LENGTH)
    if (['select', 'radio'].includes(field.type || '')) {
      if (!(field.options || []).some((option) => String(option.value) === text)) continue
    }
    result[field.name] = text
  }
  return result
}
