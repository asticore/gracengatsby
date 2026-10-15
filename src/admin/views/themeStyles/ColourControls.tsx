'use client'

import { useId } from 'react'

import { LIMITS, type ThemeColour } from '@/features/themeStyles/types'

import { addColour, contrastRatio, meetsAA, moveColour, parseHex, removeColour, updateColour } from './editorLogic'

type Props = { colours: ThemeColour[]; onChange: (colours: ThemeColour[]) => void }

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function HexInput({ label, value, optional, onChange }: { label: string; value: string; optional?: boolean; onChange: (value: string) => void }) {
  const textId = useId()
  const valid = (optional && value === '') || HEX.test(value)
  const swatch = parseHex(value) ? value : '#000000'
  return (
    <div className="ts-field">
      <label htmlFor={textId} className="ts-label">{label}</label>
      <div className="ts-inline">
        <input type="color" className="ts-color" aria-label={`${label} picker`} value={swatch} onChange={(event) => onChange(event.target.value)} />
        <input
          id={textId}
          type="text"
          className={`ts-input ts-input--mono${valid ? '' : ' ts-input--invalid'}`}
          style={{ width: 110 }}
          value={value}
          placeholder={optional ? 'Same as light' : '#000000'}
          aria-invalid={!valid}
          onChange={(event) => onChange(event.target.value.trim())}
        />
      </div>
    </div>
  )
}

function Contrast({ value, against, label }: { value: string; against: string; label: string }) {
  const ratio = contrastRatio(value, against)
  if (ratio === null) return null
  const pass = meetsAA(ratio)
  return (
    <span className={`ts-badge ts-badge--${pass ? 'pass' : 'fail'}`} title={`Contrast against ${label}: ${ratio.toFixed(2)}:1`}>
      {label} {ratio.toFixed(1)} {pass ? 'AA pass' : 'AA fail'}
    </span>
  )
}

export function ColourControls({ colours, onChange }: Props) {
  const text = colours.find((c) => c.id === 'text')?.value ?? '#000000'
  const background = colours.find((c) => c.id === 'background')?.value ?? '#ffffff'
  const system = colours.filter((c) => c.system)
  const custom = colours.filter((c) => !c.system)
  const patch = (id: string, change: Partial<Pick<ThemeColour, 'name' | 'value' | 'darkValue'>>) => onChange(updateColour(colours, id, change))

  const row = (colour: ThemeColour, position?: { first: boolean; last: boolean }) => (
    <li key={colour.id} className="ts-item">
      <div className="ts-item__head">
        {colour.system ? (
          <h3 className="ts-item__title">{colour.name}</h3>
        ) : (
          <div className="ts-field" style={{ flex: 1, maxWidth: 260 }}>
            <label htmlFor={`ts-colour-name-${colour.id}`} className="ts-label">Name</label>
            <input id={`ts-colour-name-${colour.id}`} type="text" className="ts-input" value={colour.name} maxLength={LIMITS.name} onChange={(event) => patch(colour.id, { name: event.target.value })} />
          </div>
        )}
        <div className="ts-inline">
          <Contrast value={colour.value} against={text} label="Text" />
          <Contrast value={colour.value} against={background} label="Background" />
        </div>
      </div>
      <div className="ts-inline">
        <HexInput label={`${colour.name} value`} value={colour.value} onChange={(value) => patch(colour.id, { value })} />
        <HexInput label={`${colour.name} dark value`} value={colour.darkValue} optional onChange={(darkValue) => patch(colour.id, { darkValue })} />
        {!colour.system && position && (
          <div className="ts-row__actions">
            <button type="button" className="ts-btn" disabled={position.first} aria-label={`Move ${colour.name} up`} onClick={() => onChange(moveColour(colours, colour.id, -1))}>Up</button>
            <button type="button" className="ts-btn" disabled={position.last} aria-label={`Move ${colour.name} down`} onClick={() => onChange(moveColour(colours, colour.id, 1))}>Down</button>
            <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${colour.name}`} onClick={() => onChange(removeColour(colours, colour.id))}>Delete</button>
          </div>
        )}
      </div>
    </li>
  )

  return (
    <div>
      <h3 className="ts-section">System colours</h3>
      <p className="ts-help">These names are fixed. Change the values; the dark value is used when a visitor has dark mode on.</p>
      <ul className="ts-list" style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>{system.map((c) => row(c))}</ul>
      <h3 className="ts-section">Custom colours ({custom.length} of {LIMITS.colours - system.length})</h3>
      <ul className="ts-list" style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
        {custom.map((c, index) => row(c, { first: index === 0, last: index === custom.length - 1 }))}
      </ul>
      <button type="button" className="ts-btn" disabled={colours.length >= LIMITS.colours} onClick={() => onChange(addColour(colours))}>Add colour</button>
    </div>
  )
}