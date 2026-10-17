'use client'

import React, { useState } from 'react'

type DimensionValue = {
  top?: string
  right?: string
  bottom?: string
  left?: string
  linked?: boolean
}

type DimensionsFieldProps = {
  value: DimensionValue | undefined
  onChange: (value: DimensionValue | undefined) => void
  label?: string
}

const UNITS = ['px', '%', 'em', 'rem'] as const

export const DimensionsField: React.FC<DimensionsFieldProps> = ({ value = {}, onChange, label }) => {
  const dims = value || {}
  const [unit, setUnit] = useState<typeof UNITS[number]>('px')

  const parseValue = (str: string | undefined): { num: string; unit: string } => {
    if (!str) return { num: '', unit }
    const match = str.match(/^([\d.]+)(px|%|em|rem)$/)
    if (match) {
      return { num: match[1], unit: match[2] as typeof UNITS[number] }
    }
    return { num: str, unit }
  }

  const top = parseValue(dims.top)
  const right = parseValue(dims.right)
  const bottom = parseValue(dims.bottom)
  const left = parseValue(dims.left)
  const linked = dims.linked === true

  const formatValue = (num: string): string => {
    if (!num) return ''
    return `${num}${unit}`
  }

  const handleDimensionChange = (side: 'top' | 'right' | 'bottom' | 'left', numStr: string) => {
    const newDims = { ...dims, linked }

    if (linked) {
      // When linked, update all sides with same unit
      const formattedVal = formatValue(numStr)
      newDims.top = formattedVal
      newDims.right = formattedVal
      newDims.bottom = formattedVal
      newDims.left = formattedVal
    } else {
      // Update only the changed side
      newDims[side] = formatValue(numStr)
    }

    onChange(newDims)
  }

  const handleUnitChange = (newUnit: typeof UNITS[number]) => {
    setUnit(newUnit)
    const newDims: DimensionValue = {}

    // Update all values with new unit
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const parsed = parseValue(dims[side])
      if (parsed.num) {
        newDims[side] = `${parsed.num}${newUnit}`
      }
    }

    if (linked) newDims.linked = true

    onChange(newDims)
  }

  const handleLinkedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLinked = e.target.checked
    const newDims: DimensionValue = { ...dims }

    if (newLinked) {
      newDims.linked = true
    } else {
      delete newDims.linked
    }

    onChange(newDims)
  }

  return (
    <div className="ve-dimensions-field">
      {label && <label className="ve-dimensions-field__label">{label}</label>}

      <div className="ve-dimensions-field__header">
        <label className="ve-dimensions-field__link-toggle">
          <input type="checkbox" checked={linked} onChange={handleLinkedChange} />
          <span>Link</span>
        </label>
        <select value={unit} onChange={(e) => handleUnitChange(e.target.value as typeof UNITS[number])} className="ve-dimensions-field__unit">
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <div className="ve-dimensions-field__grid">
        <div className="ve-dimensions-field__input-group">
          <label className="ve-dimensions-field__side-label">T</label>
          <input
            type="text"
            placeholder="0"
            value={top.num}
            onChange={(e) => handleDimensionChange('top', e.target.value)}
            className="ve-dimensions-field__input"
          />
        </div>

        <div className="ve-dimensions-field__input-group">
          <label className="ve-dimensions-field__side-label">R</label>
          <input
            type="text"
            placeholder="0"
            value={right.num}
            onChange={(e) => handleDimensionChange('right', e.target.value)}
            className="ve-dimensions-field__input"
          />
        </div>

        <div className="ve-dimensions-field__input-group">
          <label className="ve-dimensions-field__side-label">B</label>
          <input
            type="text"
            placeholder="0"
            value={bottom.num}
            onChange={(e) => handleDimensionChange('bottom', e.target.value)}
            className="ve-dimensions-field__input"
          />
        </div>

        <div className="ve-dimensions-field__input-group">
          <label className="ve-dimensions-field__side-label">L</label>
          <input
            type="text"
            placeholder="0"
            value={left.num}
            onChange={(e) => handleDimensionChange('left', e.target.value)}
            className="ve-dimensions-field__input"
          />
        </div>
      </div>
    </div>
  )
}
