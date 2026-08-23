'use client'

import React from 'react'

import type { CustomFieldDef } from './types'

/**
 * Renders one custom field as a real input. Shared deliberately between the
 * native admin panel and the visual editor's field panel so a custom field
 * looks and behaves the same wherever it is edited.
 *
 * Styling is intentionally class-based (`cf-*`), with the two surfaces
 * supplying their own CSS, rather than inline styles that would fight the
 * host's theme.
 */
export const CustomFieldInput: React.FC<{
  def: CustomFieldDef
  value: unknown
  onChange: (value: unknown) => void
  onPickImage?: () => void
}> = ({ def, value, onChange, onPickImage }) => {
  const id = `cf-${def.name}`

  const label = (
    <label className="cf-field__label" htmlFor={id}>
      {def.label}
      {def.required ? <span className="cf-field__required"> *</span> : null}
    </label>
  )

  const help = def.helpText ? <p className="cf-field__help">{def.helpText}</p> : null

  const wrap = (control: React.ReactNode) => (
    <div className="cf-field">
      {label}
      {control}
      {help}
    </div>
  )

  switch (def.type) {
    case 'textarea':
      return wrap(
        <textarea
          id={id}
          className="cf-field__control"
          rows={4}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />,
      )

    case 'number':
      return wrap(
        <input
          id={id}
          className="cf-field__control"
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />,
      )

    case 'checkbox':
      return (
        <div className="cf-field cf-field--inline">
          <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {label}
          {help}
        </div>
      )

    case 'select':
      return wrap(
        <select
          id={id}
          className="cf-field__control"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {(def.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>,
      )

    case 'date':
      return wrap(
        <input
          id={id}
          className="cf-field__control"
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />,
      )

    case 'color':
      return wrap(
        <div className="cf-field__color">
          <input
            id={id}
            type="color"
            value={typeof value === 'string' && value ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            className="cf-field__control"
            type="text"
            placeholder="#000000"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>,
      )

    case 'image':
      return wrap(
        <div className="cf-field__image">
          {typeof value === 'string' && value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="cf-field__thumb" />
          ) : (
            <div className="cf-field__thumb cf-field__thumb--empty">No image</div>
          )}
          <div className="cf-field__image-actions">
            {onPickImage && (
              <button type="button" className="cf-btn" onClick={onPickImage}>
                {value ? 'Change' : 'Choose image'}
              </button>
            )}
            {value ? (
              <button type="button" className="cf-btn" onClick={() => onChange(undefined)}>
                Remove
              </button>
            ) : null}
          </div>
        </div>,
      )

    case 'url':
    case 'text':
    default:
      return wrap(
        <input
          id={id}
          className="cf-field__control"
          type={def.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />,
      )
  }
}
