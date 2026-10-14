'use client'

import React from 'react'

/** A labelled control with an optional plain-English hint. Shared by the block and brand editors. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="ed-field">
      <span className="ed-field__label">{label}</span>
      {children}
      {hint && <span className="ed-field__hint">{hint}</span>}
    </label>
  )
}

type TextProps = { label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string; maxLength?: number }

export function TextField({ label, value, onChange, hint, placeholder, maxLength }: TextProps) {
  return (
    <Field label={label} hint={hint}>
      <input className="ed-input" type="text" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

export function LongTextField({ label, value, onChange, hint, maxLength }: Omit<TextProps, 'placeholder'>) {
  return (
    <Field label={label} hint={hint}>
      <textarea className="ed-input ed-input--long" value={value} maxLength={maxLength} rows={4} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

type NumberProps = { label: string; value: number; min: number; max: number; onChange: (value: number) => void; hint?: string; title?: string }

export function NumberField({ label, value, min, max, onChange, hint, title }: NumberProps) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="ed-input ed-input--short"
        type="number"
        title={title}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </Field>
  )
}

type SelectProps<T extends string> = {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  hint?: string
}

export function SelectField<T extends string>({ label, value, options, onChange, hint }: SelectProps<T>) {
  return (
    <Field label={label} hint={hint}>
      <select className="ed-input" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <span className="ed-color">
        <input className="ed-color__swatch" type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        <input className="ed-input ed-input--short" type="text" value={value} maxLength={7} onChange={(event) => onChange(event.target.value)} />
      </span>
    </Field>
  )
}
