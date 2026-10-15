'use client'

import { useId } from 'react'

/** Small labelled inputs shared by the Theme styles tabs. Every input has a visible label. */

export function NumberField({ label, value, min, max, step = 1, onChange, help }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; help?: string }) {
  const id = useId()
  return (
    <div className="ts-field">
      <label htmlFor={id} className="ts-label">{label}</label>
      <input
        id={id}
        type="number"
        className="ts-input"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
        }}
      />
      {help && <p className="ts-help">{help}</p>}
    </div>
  )
}

export function SelectField<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  const id = useId()
  return (
    <div className="ts-field">
      <label htmlFor={id} className="ts-label">{label}</label>
      <select
        id={id}
        className="ts-input"
        value={String(value)}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value)
          if (match) onChange(match.value)
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

export function TextField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
  const id = useId()
  return (
    <div className="ts-field">
      <label htmlFor={id} className="ts-label">{label}</label>
      <input id={id} type="text" className="ts-input" value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

export const TRANSFORM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
] as const

export const WEIGHT_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: w, label: String(w) }))