'use client'

import { useId, useState } from 'react'

import type { ThemeColour } from '@/features/themeStyles/types'

import { parseHex, resolveColour } from './editorLogic'

type Props = {
  label: string
  value: string
  colours: readonly ThemeColour[]
  onChange: (value: string) => void
  /** Allow '' (inherit / none). */
  allowEmpty?: boolean
  emptyLabel?: string
  /** Allow the literal 'transparent'. */
  allowTransparent?: boolean
}

const CUSTOM = '__custom__'
const EMPTY = '__empty__'
const TRANSPARENT = 'transparent'

/**
 * Picks a global colour from a dropdown (stored as '@id') or a literal colour
 * ("Custom..."). The dropdown option text carries the colour name and value; a
 * swatch beside it shows the resolved colour.
 */
export function ColourRefInput({ label, value, colours, onChange, allowEmpty, emptyLabel = 'None', allowTransparent }: Props) {
  const id = useId()
  const isRef = value.startsWith('@') && colours.some((c) => c.id === value.slice(1))
  const isEmpty = value === ''
  const isTransparent = value === TRANSPARENT
  const [forceCustom, setForceCustom] = useState(false)
  const mode = isRef ? value : isEmpty && !forceCustom ? EMPTY : isTransparent ? TRANSPARENT : CUSTOM
  const shown = isEmpty ? '' : resolveColour(value, colours)
  const hex = parseHex(shown) ? shown : '#000000'

  return (
    <div className="ts-ref">
      <label htmlFor={id} className="ts-label">{label}</label>
      <div className="ts-ref__row">
        <span className="ts-swatch" aria-hidden="true"><span style={{ background: shown || 'transparent' }} /></span>
        <select
          id={id}
          className="ts-input"
          value={mode}
          onChange={(event) => {
            const next = event.target.value
            if (next === EMPTY) { setForceCustom(false); onChange('') }
            else if (next === TRANSPARENT) { setForceCustom(false); onChange(TRANSPARENT) }
            else if (next === CUSTOM) { setForceCustom(true); onChange(parseHex(shown) ? shown : '#000000') }
            else { setForceCustom(false); onChange(next) }
          }}
        >
          {allowEmpty && <option value={EMPTY}>{emptyLabel}</option>}
          {allowTransparent && <option value={TRANSPARENT}>Transparent</option>}
          {colours.map((c) => (
            <option key={c.id} value={`@${c.id}`}>{c.name} ({c.value})</option>
          ))}
          <option value={CUSTOM}>Custom...</option>
        </select>
      </div>
      {mode === CUSTOM && (
        <div className="ts-ref__row">
          <input type="color" className="ts-color" aria-label={`${label} custom colour picker`} value={hex} onChange={(event) => onChange(event.target.value)} />
          <input type="text" className="ts-input ts-input--mono" aria-label={`${label} custom colour value`} value={value} placeholder="#000000" onChange={(event) => onChange(event.target.value.trim())} />
        </div>
      )}
    </div>
  )
}