'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { EditorField } from '@/lib/elements/fieldTypes'

type ColorValue = {
  value: string
  globalColorId?: string
}

/**
 * Color picker for the visual editor. Handles both hex color input and selection
 * from global color tokens in the Theming global.
 *
 * Output shape: { value: "#ff0000", globalColorId?: "color-primary" }
 * - If globalColorId is set, renderer uses that token at runtime (fallback to value if missing)
 * - If only value is set, uses the fixed hex color
 */
export const ColorPickerField: React.FC<{
  field: EditorField
  value: unknown
  onChange: (value: unknown) => void
}> = ({ field, value, onChange }) => {
  const [globalColors, setGlobalColors] = useState<{ id: string; label: string; value: string }[]>([])
  const [showColorGrid, setShowColorGrid] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Normalize value to ColorValue type
  const colorObj: ColorValue = (() => {
    if (!value) return { value: '#000000' }
    if (typeof value === 'string') return { value }
    if (typeof value === 'object' && (value as any).value) return value as ColorValue
    return { value: '#000000' }
  })()

  const currentHex = colorObj.value || '#000000'

  // Fetch global colors from Theming global
  useEffect(() => {
    fetch('/api/theming?depth=0', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { colors?: { id: string; label: string; value: string }[] }) => {
        setGlobalColors(data?.colors || [])
      })
      .catch(() => {})
  }, [])

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowColorGrid(false)
      }
    }
    if (showColorGrid) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColorGrid])

  const handleHexInputChange = (hex: string) => {
    // Sanitize hex input: prepend # if missing, remove non-hex chars
    let sanitized = hex.trim()
    if (!sanitized.startsWith('#')) sanitized = '#' + sanitized
    sanitized = sanitized.replace(/[^#0-9a-fA-F]/g, '')
    setInputValue(sanitized)

    // Update if valid hex
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(sanitized)) {
      onChange({ value: sanitized })
    }
  }

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
    onChange({ value: hex })
    setInputValue(hex)
  }

  const pickGlobalColor = (colorId: string, colorValue: string) => {
    onChange({ value: colorValue, globalColorId: colorId })
    setShowColorGrid(false)
  }

  const widthClass = field.width === 'half' ? 've-field--half' : 've-field--full'

  return (
    <label className={`ve-field ${widthClass}`} style={{ position: 'relative' }}>
      <span>{field.label}</span>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', position: 'relative' }}>
        {/* Color swatch box */}
        <div
          style={{
            width: '50px',
            height: '40px',
            backgroundColor: currentHex,
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          onClick={() => setShowColorGrid(!showColorGrid)}
        />

        {/* Hex input field */}
        <input
          type="text"
          placeholder="#000000"
          value={inputValue || currentHex}
          onChange={(e) => handleHexInputChange(e.target.value)}
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
        />

        {/* Native color picker */}
        <input
          type="color"
          value={currentHex}
          onChange={handleColorInputChange}
          style={{
            width: '40px',
            height: '40px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '2px',
          }}
        />
      </div>

      {/* Color grid popover */}
      {showColorGrid && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '12px',
            marginTop: '4px',
            minWidth: '250px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold' }}>Global colors</p>
          {globalColors.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                gap: '8px',
              }}
            >
              {globalColors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => pickGlobalColor(color.id, color.value)}
                  title={color.label}
                  style={{
                    padding: 0,
                    border: colorObj.globalColorId === color.id ? '2px solid #333' : '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '40px',
                      backgroundColor: color.value,
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                  <span style={{ padding: '0 4px 4px 4px', textAlign: 'center', color: '#666' }}>{color.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>No colors defined yet.</p>
          )}
        </div>
      )}

      {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
    </label>
  )
}
