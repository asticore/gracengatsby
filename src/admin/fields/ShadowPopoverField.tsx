'use client'

import React, { useState } from 'react'

export type ShadowValue = {
  offsetX?: string
  offsetY?: string
  blur?: string
  spread?: string
  color?: string
  opacity?: number
}

export const ShadowPopoverField: React.FC<{
  value: unknown
  onChange: (v: ShadowValue) => void
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false)

  const current = (typeof value === 'object' && value ? (value as ShadowValue) : {}) as ShadowValue
  const offsetX = current.offsetX || '0'
  const offsetY = current.offsetY || '4px'
  const blur = current.blur || '6px'
  const spread = current.spread || '0'
  const color = current.color || '#000000'
  const opacity = current.opacity ?? 0.3

  const handleChange = (updates: Partial<ShadowValue>) => {
    onChange({ ...current, ...updates })
  }

  const parseValue = (v: string): string => {
    if (v === '0' || v === '0px') return '0'
    return v.endsWith('px') || v.endsWith('em') ? v : v + 'px'
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
        Shadow: {parseValue(offsetX)} {parseValue(offsetY)} {parseValue(blur)} {parseValue(spread)} @ {Math.round(opacity * 100)}%
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
            minWidth: '280px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Offset X */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Offset X
            </label>
            <input
              type="text"
              value={offsetX}
              onChange={(e) => handleChange({ offsetX: e.target.value })}
              placeholder="0"
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Offset Y */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Offset Y
            </label>
            <input
              type="text"
              value={offsetY}
              onChange={(e) => handleChange({ offsetY: e.target.value })}
              placeholder="4px"
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Blur */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Blur
            </label>
            <input
              type="text"
              value={blur}
              onChange={(e) => handleChange({ blur: e.target.value })}
              placeholder="6px"
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Spread */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Spread
            </label>
            <input
              type="text"
              value={spread}
              onChange={(e) => handleChange({ spread: e.target.value })}
              placeholder="0"
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Color */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Color
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="color"
                value={color}
                onChange={(e) => handleChange({ color: e.target.value })}
                style={{
                  width: '50px',
                  height: '32px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={color}
                onChange={(e) => handleChange({ color: e.target.value })}
                placeholder="#000000"
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          {/* Opacity */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
              Opacity: {Math.round(opacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => handleChange({ opacity: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>

          {/* Preview */}
          <div
            style={{
              marginBottom: '12px',
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '3px',
              border: '1px solid #e0e0e0',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                backgroundColor: 'white',
                borderRadius: '4px',
                boxShadow: `${parseValue(offsetX)} ${parseValue(offsetY)} ${parseValue(blur)} ${parseValue(spread)} ${color}`,
                opacity: 1,
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
