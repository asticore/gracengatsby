'use client'

import React, { useState } from 'react'
import { BUILT_IN_FONTS } from '@/features/fonts/installed'

export type TypographyValue = {
  family?: string
  size?: string
  unit?: string
  weight?: number
  lineHeight?: string
  letterSpacing?: string
}

const WEIGHT_OPTIONS = [
  { value: 100, label: '100 - Thin' },
  { value: 200, label: '200 - Extra Light' },
  { value: 300, label: '300 - Light' },
  { value: 400, label: '400 - Normal' },
  { value: 500, label: '500 - Medium' },
  { value: 600, label: '600 - Semi Bold' },
  { value: 700, label: '700 - Bold' },
  { value: 800, label: '800 - Extra Bold' },
  { value: 900, label: '900 - Black' },
]

const UNIT_OPTIONS = [
  { value: 'px', label: 'px' },
  { value: 'em', label: 'em' },
  { value: 'rem', label: 'rem' },
]

export const TypographyPopoverField: React.FC<{
  value: unknown
  onChange: (v: TypographyValue) => void
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false)

  const current = (typeof value === 'object' && value ? (value as TypographyValue) : {}) as TypographyValue
  const family = current.family || 'Inter'
  const size = current.size || '16'
  const unit = current.unit || 'px'
  const weight = current.weight || 400
  const lineHeight = current.lineHeight || '1.5'
  const letterSpacing = current.letterSpacing || '0'

  const familyObj = BUILT_IN_FONTS.find((f) => f.value === family)
  const displayFamily = familyObj?.family || family

  const handleChange = (updates: Partial<TypographyValue>) => {
    onChange({ ...current, ...updates })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#f9f9f9',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '13px',
        }}
      >
        {displayFamily} · {size}{unit} · W{weight}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginTop: '4px',
            padding: '12px',
            minWidth: '250px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Family */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Font Family
            </label>
            <select
              value={family}
              onChange={(e) => handleChange({ family: e.target.value })}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            >
              {BUILT_IN_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.family}
                </option>
              ))}
            </select>
          </div>

          {/* Size */}
          <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
                Size
              </label>
              <input
                type="number"
                value={size}
                onChange={(e) => handleChange({ size: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  fontSize: '12px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => handleChange({ unit: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  fontSize: '12px',
                }}
              >
                {UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Weight */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Font Weight
            </label>
            <select
              value={weight}
              onChange={(e) => handleChange({ weight: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            >
              {WEIGHT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Line Height */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Line Height
            </label>
            <input
              type="text"
              value={lineHeight}
              onChange={(e) => handleChange({ lineHeight: e.target.value })}
              placeholder="e.g. 1.5"
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Letter Spacing */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Letter Spacing
            </label>
            <input
              type="text"
              value={letterSpacing}
              onChange={(e) => handleChange({ letterSpacing: e.target.value })}
              placeholder="e.g. 0 or 0.05em"
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              width: '100%',
              padding: '6px 8px',
              backgroundColor: '#f0f0f0',
              border: '1px solid #ccc',
              borderRadius: '3px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
