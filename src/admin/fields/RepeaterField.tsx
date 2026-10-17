'use client'

import React, { useState } from 'react'
import { useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel } from './shared'

type RepeaterFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * Repeater field: renders an array of objects as a table with Add/Delete/Reorder buttons.
 * Each column corresponds to a field in field.repeater.fields.
 */
export const RepeaterFieldRenderer: React.FC<RepeaterFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<unknown>({ path })
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const repeaterDef = (field.repeater as any) || { fields: [] }
  const rows = Array.isArray(value) ? value : []

  const addRow = (insertIndex: number) => {
    const newRow: Record<string, unknown> = {}
    for (const f of repeaterDef.fields) {
      newRow[f.name] = ''
    }
    const updated = [...rows]
    updated.splice(insertIndex + 1, 0, newRow)
    setValue(updated)
  }

  const deleteRow = (index: number) => {
    setValue(rows.filter((_, i) => i !== index))
  }

  const moveRow = (index: number, direction: 'up' | 'down') => {
    const updated = [...rows]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= updated.length) return
    ;[updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]]
    setValue(updated)
  }

  const updateCell = (rowIndex: number, fieldName: string, value: unknown) => {
    const updated = [...rows]
    updated[rowIndex] = { ...updated[rowIndex], [fieldName]: value }
    setValue(updated)
  }

  return (
    <div className="field-type repeater">
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
        {(() => {
          const label = fieldLabel(field)
          return typeof label === 'string' ? label : label ? Object.values(label)[0] : undefined
        })()}
      </label>

      {rows.length === 0 ? (
        <p style={{ color: '#999', marginBottom: '0.5rem' }}>No rows yet</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '0.5rem', textAlign: 'left', width: '50px', fontWeight: 600 }}>#</th>
                {repeaterDef.fields.map((f: any) => (
                  <th key={f.name} style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>
                    {f.label}
                  </th>
                ))}
                <th style={{ padding: '0.5rem', textAlign: 'center', width: '120px', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem', backgroundColor: '#fafafa', textAlign: 'center', fontWeight: 500 }}>
                    {rowIndex + 1}
                  </td>
                  {repeaterDef.fields.map((f: any) => (
                    <td key={f.name} style={{ padding: '0.5rem' }}>
                      {f.type === 'text' || f.type === 'number' ? (
                        <input
                          type={f.type === 'number' ? 'number' : 'text'}
                          value={String((row as any)?.[f.name] ?? '')}
                          onChange={(e) => updateCell(rowIndex, f.name, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                          disabled={readOnly}
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                          }}
                        />
                      ) : f.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={Boolean((row as any)?.[f.name])}
                          onChange={(e) => updateCell(rowIndex, f.name, e.target.checked)}
                          disabled={readOnly}
                          style={{ cursor: readOnly ? 'not-allowed' : 'pointer' }}
                        />
                      ) : (
                        <span style={{ color: '#999' }}>–</span>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => addRow(rowIndex)}
                        disabled={readOnly}
                        title="Add row after this"
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                          opacity: readOnly ? 0.5 : 1,
                        }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRow(rowIndex, 'up')}
                        disabled={readOnly || rowIndex === 0}
                        title="Move up"
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: readOnly || rowIndex === 0 ? 'not-allowed' : 'pointer',
                          opacity: readOnly || rowIndex === 0 ? 0.5 : 1,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRow(rowIndex, 'down')}
                        disabled={readOnly || rowIndex === rows.length - 1}
                        title="Move down"
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: readOnly || rowIndex === rows.length - 1 ? 'not-allowed' : 'pointer',
                          opacity: readOnly || rowIndex === rows.length - 1 ? 0.5 : 1,
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRow(rowIndex)}
                        disabled={readOnly}
                        title="Delete row"
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                          opacity: readOnly ? 0.5 : 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (rows.length === 0) {
            addRow(-1)
          } else {
            addRow(rows.length - 1)
          }
        }}
        disabled={readOnly}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: readOnly ? 'not-allowed' : 'pointer',
          opacity: readOnly ? 0.5 : 1,
          fontWeight: 500,
        }}
      >
        Add row
      </button>
    </div>
  )
}
