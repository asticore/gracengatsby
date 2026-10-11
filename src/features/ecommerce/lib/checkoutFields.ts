/**
 * The optional-field editor behind checkout. The shop owner can enable,
 * require, reorder and relabel the built-in optional fields and add their own
 * text fields; checkout renders from the resolved list and the server
 * validates against the same list, so a hidden or invented field is dropped.
 */

export type CheckoutFieldRow = {
  key: string
  label?: string | null
  type?: 'text' | 'textarea' | 'tel' | null
  enabled?: boolean | null
  required?: boolean | null
  placeholder?: string | null
}

export type CheckoutField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'tel'
  enabled: boolean
  required: boolean
  placeholder: string
  builtIn: boolean
}

export const BUILT_IN_CHECKOUT_FIELDS: Omit<CheckoutField, 'builtIn'>[] = [
  { key: 'company', label: 'Company', type: 'text', enabled: false, required: false, placeholder: '' },
  { key: 'phone', label: 'Phone', type: 'tel', enabled: false, required: false, placeholder: '' },
  { key: 'addressLine2', label: 'Apartment, suite, unit', type: 'text', enabled: false, required: false, placeholder: '' },
  { key: 'abn', label: 'ABN', type: 'text', enabled: false, required: false, placeholder: '11 digit ABN' },
  { key: 'orderNotes', label: 'Order notes', type: 'textarea', enabled: false, required: false, placeholder: 'Notes about your order, e.g. delivery instructions' },
]

const BUILT_IN_KEYS = new Set(BUILT_IN_CHECKOUT_FIELDS.map((f) => f.key))

export function sanitizeKey(key: unknown): string {
  return typeof key === 'string' ? key.trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) : ''
}

/** Settings rows in, the complete ordered field list out (missing built-ins are appended, disabled). */
export function resolveCheckoutFields(rows: CheckoutFieldRow[] | null | undefined): CheckoutField[] {
  const out: CheckoutField[] = []
  const seen = new Set<string>()
  for (const row of rows ?? []) {
    const key = sanitizeKey(row?.key)
    if (!key || seen.has(key)) continue
    const base = BUILT_IN_CHECKOUT_FIELDS.find((f) => f.key === key)
    seen.add(key)
    out.push({
      key,
      label: (row.label ?? '').toString().trim().slice(0, 80) || base?.label || key,
      type: row.type === 'textarea' || row.type === 'tel' ? row.type : (base?.type ?? 'text'),
      enabled: Boolean(row.enabled),
      required: Boolean(row.required),
      placeholder: (row.placeholder ?? base?.placeholder ?? '').toString().slice(0, 120),
      builtIn: BUILT_IN_KEYS.has(key),
    })
  }
  for (const base of BUILT_IN_CHECKOUT_FIELDS) {
    if (!seen.has(base.key)) out.push({ ...base, builtIn: true })
  }
  return out
}

export type CheckoutFieldValues = Record<string, { label: string; value: string }>

/** Validates submitted values against the enabled fields. Unknown or disabled keys are ignored. */
export function validateCheckoutValues(
  fields: CheckoutField[],
  submitted: Record<string, unknown> | null | undefined,
): { ok: true; values: CheckoutFieldValues } | { ok: false; errors: Record<string, string> } {
  const values: CheckoutFieldValues = {}
  const errors: Record<string, string> = {}
  for (const f of fields) {
    if (!f.enabled) continue
    const raw = submitted?.[f.key]
    const value = (typeof raw === 'string' ? raw : '').trim().slice(0, f.type === 'textarea' ? 2000 : 300)
    if (!value) {
      if (f.required) errors[f.key] = `${f.label} is required.`
      continue
    }
    if (f.key === 'abn' && !/^\d{11}$/.test(value.replace(/\s+/g, ''))) {
      errors[f.key] = 'An ABN is 11 digits.'
      continue
    }
    values[f.key] = { label: f.label, value }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values }
}
