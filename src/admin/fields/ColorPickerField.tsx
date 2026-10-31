'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useEffect, useRef, useState } from 'react'
import type { EditorField } from '@/lib/elements/fieldTypes'
import { readColourTokens, type ColourToken } from '@/views/visualEditor/designHelpers'

type ColorValue = {
  value: string
  globalColorId?: string
}

const TOKEN_CSS = /^var\((--eg-c-[a-z0-9_-]+)\)$/

/** The theme colour token name (--eg-c-<id>) a stored value links to, or null for a plain colour. */
export function linkedTokenName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = TOKEN_CSS.exec(value.trim())
  return m ? m[1] : null
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
  const t = useAdminT()
  const [globalColors, setGlobalColors] = useState<{ id: string; label: string; value: string }[]>([])
  const [showColorGrid, setShowColorGrid] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [tokens, setTokens] = useState<ColourToken[]>([])
  const [showTokens, setShowTokens] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Normalize value to ColorValue type
  const colorObj: ColorValue = (() => {
    if (!value) return { value: '#000000' }
    if (typeof value === 'string') return { value }
    if (typeof value === 'object' && (value as any).value) return value as ColorValue
    return { value: '#000000' }
  })()

  // A linked theme token has no hex of its own: the native picker shows black, the swatch uses the token colour.
  const linked = linkedTokenName(colorObj.value)
  const linkedTokenValue = linked ? tokens.find((t) => t.name === linked)?.value : undefined
  const currentHex = linked ? '#000000' : colorObj.value || '#000000'

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

  // Tokens are read from the document only when the list opens, never during render.
  const toggleTokens = () => {
    if (!showTokens) setTokens(readColourTokens(document))
    setShowTokens(!showTokens)
  }

  const pickToken = (token: ColourToken) => {
    onChange(token.css)
    setInputValue('')
    setShowTokens(false)
  }

  const clearToken = () => {
    onChange(undefined)
    setInputValue('')
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
            backgroundColor: linked ? linkedTokenValue || `var(${linked})` : currentHex,
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

      {/* Theme colour tokens: link the value to a --eg-c-<id> variable instead of a fixed hex */}
      <div className="ve-colour-linkrow">
        <button type="button" className="ve-colour-tokbtn" aria-expanded={showTokens} onClick={toggleTokens}>
          Theme colours
        </button>
        {linked && (
          <span className="ve-colour-chip" title={linked}>
            <span className="ve-colour-chip__dot" style={{ background: linkedTokenValue || `var(${linked})` }} />
            <span>{linked}</span>
            <button type="button" className="ve-colour-chip__clear" onClick={clearToken} aria-label={t('aria.clearThemeColourLink')}>
              clear
            </button>
          </span>
        )}
      </div>
      {showTokens && (
        <div className="ve-colour-tokens">
          {tokens.length === 0 ? (
            <span className="ve-colour-tokens__empty">No theme colours on this page.</span>
          ) : (
            tokens.map((t) => (
              <button
                key={t.name}
                type="button"
                className={linked === t.name ? 've-colour-token ve-colour-token--on' : 've-colour-token'}
                onClick={() => pickToken(t)}
                title={t.css}
              >
                <span className="ve-colour-token__swatch" style={{ background: t.value || 'transparent' }} />
                <span>{t.name}</span>
              </button>
            ))
          )}
        </div>
      )}

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
