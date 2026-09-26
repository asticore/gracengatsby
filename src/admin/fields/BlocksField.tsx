'use client'

import React, { useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from './shared'
import { RowSubfieldInput, flattenRowFields } from './ArrayField'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * Real repeatable-row UI for `blocks` field type, replacing the raw-JSON-textarea
 * stopgap (Stage 11 Phase 3 polish). Manages an array of block row objects at the
 * global form level via a single `useField<BlockRowType[]>({path})` call, with
 * per-block-subfield editing via local controlled inputs (RowSubfieldInput).
 *
 * Each row object carries a `blockType: string` discriminator (matching one of
 * `field.blocks[].slug`) at the top level of the row, alongside that block's
 * own fields' data - real Payload convention.
 */
export const BlocksFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { value, setValue } = useField<Record<string, unknown>[]>({ path })
  const blocksValue = Array.isArray(value) ? value : []

  const blocks = (field as { blocks?: Array<{ slug: string; labels?: { singular?: string; plural?: string }; fields: Field[] }> }).blocks ?? []
  const minRows = (field as { minRows?: number }).minRows
  const maxRows = (field as { maxRows?: number }).maxRows
  const labels = (field as { labels?: { singular?: string; plural?: string } }).labels
  const singularLabel = labels?.singular ?? 'Block'
  const pluralLabel = labels?.plural ?? 'Blocks'

  const [selectedBlockType, setSelectedBlockType] = useState<string>(blocks[0]?.slug ?? '')

  if (blocks.length === 0) {
    return (
      <div className="field-type blocks">
        <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />
        <div style={{ padding: '8px 0', color: '#666', fontSize: '0.95em' }}>No block types configured.</div>
      </div>
    )
  }

  const canAddMore = !maxRows || blocksValue.length < maxRows
  const atMinimum = minRows ? blocksValue.length <= minRows : false

  const moveUp = (index: number) => {
    if (index === 0) return
    const newArray = [...blocksValue]
    ;[newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]]
    setValue(newArray)
  }

  const moveDown = (index: number) => {
    if (index === blocksValue.length - 1) return
    const newArray = [...blocksValue]
    ;[newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]]
    setValue(newArray)
  }

  const removeRow = (index: number) => {
    const newArray = blocksValue.filter((_, i) => i !== index)
    setValue(newArray)
  }

  const updateRowSubfield = (rowIndex: number, subfieldName: string, newValue: unknown) => {
    const newArray = [...blocksValue]
    const row = { ...newArray[rowIndex] }
    row[subfieldName] = newValue
    newArray[rowIndex] = row
    setValue(newArray)
  }

  const addBlock = () => {
    if (!canAddMore || !selectedBlockType) return
    const newRow: Record<string, unknown> = { blockType: selectedBlockType }

    // Seed subfields with defaultValue if present and not a function
    const blockDef = blocks.find((b) => b.slug === selectedBlockType)
    if (blockDef) {
      for (const subfield of flattenRowFields(blockDef.fields)) {
        const name = 'name' in subfield ? subfield.name : undefined
        if (!name) continue
        const defaultVal = (subfield as { defaultValue?: unknown }).defaultValue
        if (defaultVal !== undefined && typeof defaultVal !== 'function') {
          newRow[name] = defaultVal
        }
      }
    }

    setValue([...blocksValue, newRow])
  }

  return (
    <div className="field-type blocks">
      <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />

      {blocksValue.length === 0 ? (
        <div style={{ padding: '8px 0', color: '#666', fontSize: '0.95em' }}>No {pluralLabel.toLowerCase()} yet.</div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {blocksValue.map((row, rowIndex) => {
            const blockType = String(row.blockType ?? '')
            const blockDef = blocks.find((b) => b.slug === blockType)
            const blockLabel = blockDef?.labels?.singular ?? blockType ?? 'Unknown Block'

            return (
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
                    {blockLabel} {rowIndex + 1}
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
                        disabled={rowIndex === blocksValue.length - 1}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.85em',
                          cursor: rowIndex === blocksValue.length - 1 ? 'not-allowed' : 'pointer',
                          opacity: rowIndex === blocksValue.length - 1 ? 0.5 : 1,
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

                {/* Block subfields */}
                {blockDef ? (
                  <div>
                    {flattenRowFields(blockDef.fields).map((subfield) => {
                      const subfieldName = 'name' in subfield ? subfield.name : undefined
                      if (!subfieldName) return null

                      // row/collapsible already flattened above; group/tabs/ui skipped (rare here).
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
                ) : (
                  <div style={{ padding: '8px', color: '#d32f2f', fontSize: '0.9em' }}>Unknown block type: {blockType}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add block control */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor={`select-block-type-${path}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.9em' }}>
              Block type
            </label>
            <select
              id={`select-block-type-${path}`}
              value={selectedBlockType}
              onChange={(e) => setSelectedBlockType(e.target.value)}
              style={{ padding: '4px 8px' }}
            >
              {blocks.map((blockDef) => (
                <option key={blockDef.slug} value={blockDef.slug}>
                  {blockDef.labels?.singular ?? blockDef.slug}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addBlock}
            disabled={!canAddMore}
            style={{
              padding: '8px 12px',
              cursor: canAddMore ? 'pointer' : 'not-allowed',
              opacity: canAddMore ? 1 : 0.5,
            }}
          >
            Add {singularLabel}
          </button>
          {atMinimum && <div style={{ fontSize: '0.85em', color: '#f57c00' }}>Minimum {minRows} required</div>}
        </div>
      )}
    </div>
  )
}
