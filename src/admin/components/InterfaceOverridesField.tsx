'use client'

import React from 'react'

import type { Field } from '@/engine'
import { FieldLabel, useField } from '@/engine/ui'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { LOCALE_OPTIONS } from '@/features/multilingual/locales'
import { UI_STRING_SOURCE } from '@/features/uiStrings/keys'
import { STORE_STRING_KEYS, type InterfaceOverride } from '@/features/uiStrings/storeTexts'

type Props = { field: Field; path: string; readOnly?: boolean }

/** Keeps every row the editor holds, blank text included, so a row being typed in does not vanish. */
const editableRows = (raw: unknown): InterfaceOverride[] => {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      key: typeof item.key === 'string' ? item.key : '',
      locale: typeof item.locale === 'string' ? item.locale : '',
      value: typeof item.value === 'string' ? item.value : '',
    }))
}

const MAX_ROWS = 500

/**
 * Owner wording for storefront interface text, as a table: key, language, text.
 * Stored as a JSON list of { key, locale, value } on language settings. Blank
 * rows are kept while editing and ignored on read (see parseInterfaceOverrides).
 */
export function InterfaceOverridesField({ field, path, readOnly }: Props) {
  const { value, setValue } = useField<unknown>({ path })
  const rows = editableRows(value)

  const commit = (next: InterfaceOverride[]) => setValue(next)
  const patch = (index: number, changes: Partial<InterfaceOverride>) =>
    commit(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  const remove = (index: number) => commit(rows.filter((_, i) => i !== index))
  const add = () => {
    if (rows.length >= MAX_ROWS) return
    commit([...rows, { key: STORE_STRING_KEYS[0] ?? 'store.addToCart', locale: LOCALE_OPTIONS[0]?.value ?? 'en-AU', value: '' }])
  }

  return (
    <div className="field-type">
      <FieldLabel label={fieldLabel(field)} name={field.name} path={path} required={fieldRequired(field)} />
      <p className="text-sm text-muted" style={{ margin: '4px 0 12px' }}>
        Wording for storefront buttons and messages in one language. Leave the text empty to use the built-in translation.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Text</th>
            <th style={{ textAlign: 'left' }}>Language</th>
            <th style={{ textAlign: 'left' }}>Wording</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td style={{ paddingRight: 8, verticalAlign: 'top' }}>
                <select
                  value={row.key}
                  disabled={readOnly}
                  onChange={(e) => patch(index, { key: e.target.value })}
                  style={{ width: '100%' }}
                >
                  {STORE_STRING_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {UI_STRING_SOURCE[key]}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ paddingRight: 8, verticalAlign: 'top' }}>
                <select value={row.locale} disabled={readOnly} onChange={(e) => patch(index, { locale: e.target.value })} style={{ width: '100%' }}>
                  {LOCALE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ paddingRight: 8, verticalAlign: 'top' }}>
                <input
                  type="text"
                  value={row.value}
                  maxLength={500}
                  disabled={readOnly}
                  onChange={(e) => patch(index, { value: e.target.value })}
                  style={{ width: '100%' }}
                />
              </td>
              <td style={{ verticalAlign: 'top' }}>
                {!readOnly && (
                  <button type="button" className="btn btn--ghost" onClick={() => remove(index)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <button type="button" className="btn" onClick={add} style={{ marginTop: 12 }} disabled={rows.length >= MAX_ROWS}>
          Add wording
        </button>
      )}
    </div>
  )
}
