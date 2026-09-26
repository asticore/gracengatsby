'use client'

import React, { useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from './shared'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

type Option = { label: string; value: string }

/**
 * `row`/`collapsible` are pure layout - Payload stores their fields at the SAME
 * level as their siblings (no extra path segment, see `childPath` in shared.ts),
 * so a `row` full of subfields inside an array/blocks row must be flattened
 * before rendering, not skipped - `row` is a very common pattern for laying out
 * paired fields (e.g. `HeroBlock`'s CTA label/URL pairs) and dropping it
 * entirely would silently make those fields uneditable. `group`/`tabs` DO add
 * a nesting level in the stored data and are left out of scope here (rare
 * inside an array/blocks row in this codebase) - callers still skip those.
 */
export function flattenRowFields(fields: Field[]): Field[] {
  const result: Field[] = []
  for (const f of fields) {
    if (f.type === 'row' || f.type === 'collapsible') {
      result.push(...flattenRowFields(f.fields))
    } else {
      result.push(f)
    }
  }
  return result
}

/**
 * Renders a single subfield within an array/blocks row using LOCAL (non-global-form)
 * controlled input - NOT wired to the global FormContext. Takes props directly:
 * `subfield` shape, `value`, `onChange` callback.
 *
 * Supports scalar leaf types: text, textarea, number, email, checkbox, date, select, radio.
 * For any unsupported type (nested group/array/blocks, richText, etc.), falls back to
 * a raw JSON textarea, same technique as JsonStopgapRenderer in FieldRenderer.tsx.
 */
export function RowSubfieldInput({
  subfield,
  value,
  onChange,
  readOnly,
}: {
  subfield: Field
  value: unknown
  onChange: (next: unknown) => void
  readOnly?: boolean
}): React.ReactNode {
  const subfieldLabel = (() => {
    const label = fieldLabel(subfield)
    return typeof label === 'string' ? label : label ? Object.values(label)[0] : undefined
  })()

  const subfieldName = 'name' in subfield ? subfield.name : undefined

  switch (subfield.type) {
    case 'text': {
      return (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
            {subfieldLabel}
          </label>
          <input
            id={`subfield-${subfieldName}`}
            type="text"
            readOnly={readOnly}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '4px 8px' }}
          />
        </div>
      )
    }

    case 'textarea': {
      const rows = (subfield as { admin?: { rows?: number } }).admin?.rows ?? 4
      return (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
            {subfieldLabel}
          </label>
          <textarea
            id={`subfield-${subfieldName}`}
            readOnly={readOnly}
            rows={rows}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '4px 8px', fontFamily: 'inherit' }}
          />
        </div>
      )
    }

    case 'number': {
      const min = (subfield as { min?: number }).min
      const max = (subfield as { max?: number }).max
      return (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
            {subfieldLabel}
          </label>
          <input
            id={`subfield-${subfieldName}`}
            type="number"
            readOnly={readOnly}
            value={typeof value === 'number' ? value : ''}
            min={min}
            max={max}
            onChange={(e) => {
              const raw = e.target.valueAsNumber
              onChange(Number.isNaN(raw) ? undefined : raw)
            }}
            style={{ width: '100%', padding: '4px 8px' }}
          />
        </div>
      )
    }

    case 'email': {
      return (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
            {subfieldLabel}
          </label>
          <input
            id={`subfield-${subfieldName}`}
            type="email"
            readOnly={readOnly}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '4px 8px' }}
          />
        </div>
      )
    }

    case 'checkbox': {
      return (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9em' }}>
            <input
              type="checkbox"
              readOnly={readOnly}
              disabled={readOnly}
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>{subfieldLabel}</span>
          </label>
        </div>
      )
    }

    case 'date': {
      return (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
            {subfieldLabel}
          </label>
          <input
            id={`subfield-${subfieldName}`}
            type="date"
            readOnly={readOnly}
            value={value ? String(value).slice(0, 10) : ''}
            onChange={(e) => {
              const raw = e.target.value
              if (!raw) {
                onChange(undefined)
                return
              }
              const iso = new Date(raw).toISOString()
              onChange(iso)
            }}
            style={{ width: '100%', padding: '4px 8px' }}
          />
        </div>
      )
    }

    case 'select': {
      const rawOptions = (subfield as { options?: Array<Option | string> }).options ?? []
      const options: Option[] = rawOptions.map((opt) => (typeof opt === 'string' ? { label: opt, value: opt } : opt))
      const hasMany = Boolean((subfield as { hasMany?: boolean }).hasMany)

      if (hasMany) {
        const selectedArray = Array.isArray(value) ? value : []
        return (
          <div style={{ marginBottom: 12 }}>
            <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
              {subfieldLabel}
            </label>
            <select
              id={`subfield-${subfieldName}`}
              multiple
              disabled={readOnly}
              value={selectedArray}
              onChange={(e) => {
                onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
              }}
              style={{ width: '100%', padding: '4px 8px' }}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )
      }

      return (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
            {subfieldLabel}
          </label>
          <select
            id={`subfield-${subfieldName}`}
            disabled={readOnly}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '4px 8px' }}
          >
            <option value="">— Select —</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )
    }

    case 'radio': {
      const rawOptions = (subfield as { options?: Array<Option | string> }).options ?? []
      const options: Option[] = rawOptions.map((opt) => (typeof opt === 'string' ? { label: opt, value: opt } : opt))

      return (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.9em', marginBottom: 4 }}>{subfieldLabel}</div>
          <div>
            {options.map((opt) => (
              <label key={opt.value} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
                <input
                  type="radio"
                  name={`subfield-${subfieldName}`}
                  value={opt.value}
                  checked={value === opt.value}
                  disabled={readOnly}
                  onChange={() => onChange(opt.value)}
                />
                {' '}{opt.label}
              </label>
            ))}
          </div>
        </div>
      )
    }

    default:
      // Unsupported subfield type (nested group/array/blocks/richText/etc) - render as raw JSON.
      // Delegated to its own component (rather than calling useState here) because this `default`
      // branch of the switch is not reached on every render - calling a hook directly inside it
      // would violate react-hooks/rules-of-hooks ("called conditionally").
      return (
        <RawJsonSubfieldInput
          subfieldName={subfieldName}
          subfieldLabel={subfieldLabel}
          subfieldType={subfield.type}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      )
  }
}

/** Raw-JSON fallback editor for a row subfield type with no dedicated input above - see RowSubfieldInput's `default` case. */
function RawJsonSubfieldInput({
  subfieldName,
  subfieldLabel,
  subfieldType,
  value,
  onChange,
  readOnly,
}: {
  subfieldName: string | undefined
  subfieldLabel: string | undefined
  subfieldType: string
  value: unknown
  onChange: (next: unknown) => void
  readOnly?: boolean
}): React.ReactNode {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)))
  const [error, setError] = useState<string | null>(null)

  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={`subfield-${subfieldName}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
        {subfieldLabel} (raw JSON - {subfieldType})
      </label>
      <textarea
        id={`subfield-${subfieldName}`}
        readOnly={readOnly}
        rows={4}
        style={{ fontFamily: 'monospace', width: '100%', padding: '4px 8px' }}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (next.trim() === '') {
            setError(null)
            onChange(undefined)
            return
          }
          try {
            onChange(JSON.parse(next))
            setError(null)
          } catch {
            setError('Not valid JSON yet - keeps your last valid value until this parses.')
          }
        }}
      />
      {error && <div style={{ fontSize: '0.85em', color: '#d32f2f', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

/**
 * Real repeatable-row UI for `array` field type, replacing the raw-JSON-textarea
 * stopgap (Stage 11 Phase 3 polish). Manages an array of row objects at the
 * global form level via a single `useField<RowType[]>({path})` call, with
 * per-row-subfield editing via local controlled inputs (RowSubfieldInput).
 */
export const ArrayFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { value, setValue } = useField<Record<string, unknown>[]>({ path })
  const arrayValue = Array.isArray(value) ? value : []

  const fields = flattenRowFields((field as { fields?: Field[] }).fields ?? [])
  const minRows = (field as { minRows?: number }).minRows
  const maxRows = (field as { maxRows?: number }).maxRows
  const labels = (field as { labels?: { singular?: string; plural?: string } }).labels
  const singularLabel = labels?.singular ?? 'Item'
  const pluralLabel = labels?.plural ?? 'Items'

  const canAddMore = !maxRows || arrayValue.length < maxRows
  const atMinimum = minRows ? arrayValue.length <= minRows : false

  const moveUp = (index: number) => {
    if (index === 0) return
    const newArray = [...arrayValue]
    ;[newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]]
    setValue(newArray)
  }

  const moveDown = (index: number) => {
    if (index === arrayValue.length - 1) return
    const newArray = [...arrayValue]
    ;[newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]]
    setValue(newArray)
  }

  const removeRow = (index: number) => {
    const newArray = arrayValue.filter((_, i) => i !== index)
    setValue(newArray)
  }

  const updateRowSubfield = (rowIndex: number, subfieldName: string, newValue: unknown) => {
    const newArray = [...arrayValue]
    const row = { ...newArray[rowIndex] }
    row[subfieldName] = newValue
    newArray[rowIndex] = row
    setValue(newArray)
  }

  const addRow = () => {
    if (!canAddMore) return
    const newRow: Record<string, unknown> = {}
    // Seed with defaultValue if present and not a function
    for (const subfield of fields) {
      const name = 'name' in subfield ? subfield.name : undefined
      if (!name) continue
      const defaultVal = (subfield as { defaultValue?: unknown }).defaultValue
      if (defaultVal !== undefined && typeof defaultVal !== 'function') {
        newRow[name] = defaultVal
      }
    }
    setValue([...arrayValue, newRow])
  }

  return (
    <div className="field-type array">
      <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />

      {arrayValue.length === 0 ? (
        <div style={{ padding: '8px 0', color: '#666', fontSize: '0.95em' }}>No {pluralLabel.toLowerCase()} yet.</div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {arrayValue.map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '12px',
                backgroundColor: '#fafafa',
              }}
            >
              {/* Row header with controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.95em' }}>
                  {singularLabel} {rowIndex + 1}
                </div>
                {!readOnly && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => moveUp(rowIndex)}
                      disabled={rowIndex === 0}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.85em',
                        cursor: rowIndex === 0 ? 'not-allowed' : 'pointer',
                        opacity: rowIndex === 0 ? 0.5 : 1,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(rowIndex)}
                      disabled={rowIndex === arrayValue.length - 1}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.85em',
                        cursor: rowIndex === arrayValue.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: rowIndex === arrayValue.length - 1 ? 0.5 : 1,
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      style={{ padding: '4px 8px', fontSize: '0.85em', cursor: 'pointer', color: '#d32f2f' }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Row subfields */}
              <div>
                {fields.map((subfield) => {
                  const subfieldName = 'name' in subfield ? subfield.name : undefined
                  if (!subfieldName) return null

                  // row/collapsible are already flattened away above; group/tabs/ui add a nesting
                  // level this opaque-row model doesn't support (rare here) - skip those only.
                  if (['ui', 'group', 'tabs'].includes(subfield.type)) {
                    return null
                  }

                  const subfieldValue = row[subfieldName]

                  return (
                    <div key={subfieldName}>
                      <RowSubfieldInput
                        subfield={subfield}
                        value={subfieldValue}
                        onChange={(newValue) => updateRowSubfield(rowIndex, subfieldName, newValue)}
                        readOnly={readOnly}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {!readOnly && (
        <div>
          <button
            type="button"
            onClick={addRow}
            disabled={!canAddMore}
            style={{
              padding: '8px 12px',
              cursor: canAddMore ? 'pointer' : 'not-allowed',
              opacity: canAddMore ? 1 : 0.5,
            }}
          >
            Add {singularLabel}
          </button>
          {atMinimum && <div style={{ fontSize: '0.85em', color: '#f57c00', marginTop: 4 }}>Minimum {minRows} required</div>}
        </div>
      )}
    </div>
  )
}
