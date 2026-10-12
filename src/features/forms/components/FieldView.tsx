'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { FormFieldDef } from '../types'

import { roundTo } from '../expression'

/**
 * One form field, drawn the same way on the live site, in the embed page and on
 * the editor canvas (so what is built is what ships). It holds no form state:
 * the value and the change handler come from the caller.
 *
 * Files are kept in the caller's state as `File[]` and sent as multipart parts;
 * every other answer is a plain value (a string, number, boolean, array or - for
 * matrix and address - a small object).
 */

export const WIDTH_CLASS: Record<string, string> = {
  full: 'form-field--full',
  half: 'form-field--half',
  third: 'form-field--third',
  twoThirds: 'form-field--two-thirds',
  quarter: 'form-field--quarter',
}

export type FieldViewProps = {
  field: FormFieldDef
  value: unknown
  error?: string
  hidden?: boolean
  onChange: (name: string, value: unknown) => void
  /** Prefix for element ids, so two forms on one page do not share ids. */
  idPrefix?: string
  currency?: string
  /** The editor canvas passes true: no network lookups, no drawing capture. */
  inert?: boolean
}

export const FieldView: React.FC<FieldViewProps> = ({ field, value, error, hidden, onChange, idPrefix = 'f', currency, inert }) => {
  if (hidden) return null

  const width = WIDTH_CLASS[field.width || 'full'] || WIDTH_CLASS.full
  const id = `${idPrefix}-${field.name || field.id}`
  const describedBy = field.helpText ? `${id}-help` : undefined
  const set = (next: unknown) => onChange(field.name || '', next)

  const wrap = (children: React.ReactNode, extra = '') => (
    <div className={`form-field ${width} form-field--${field.type}${extra}${error ? ' form-field--error' : ''}`}>
      {children}
      {field.helpText && (
        <small className="form-field__help" id={describedBy}>
          {field.helpText}
        </small>
      )}
      {error && (
        <small className="form-field__error" role="alert">
          {error}
        </small>
      )}
    </div>
  )

  const required = field.required ? <abbr title="required"> *</abbr> : null
  const label = (
    <label htmlFor={id}>
      {field.label}
      {required}
    </label>
  )
  const legend = (
    <legend>
      {field.label}
      {required}
    </legend>
  )

  switch (field.type) {
    case 'section':
      return (
        <div className={`form-field ${WIDTH_CLASS.full} form-field--section`}>
          {field.label && <h3>{field.label}</h3>}
          {field.html && <div dangerouslySetInnerHTML={{ __html: field.html }} />}
        </div>
      )

    case 'html':
      return <div className={`form-field ${width} form-field--html`} dangerouslySetInnerHTML={{ __html: field.html || '' }} />

    case 'page':
      return null

    case 'hidden':
      return <input type="hidden" name={field.name} value={String(value ?? '')} readOnly />

    case 'payment':
      return wrap(
        <div className="engage-form__total">
          <span>{field.label || 'Total'}</span>
          <strong>{currency ? `${currency} ` : ''}{roundTo(Number(value) || 0, 2).toFixed(2)}</strong>
        </div>,
      )

    case 'calculation': {
      const decimals = field.calculation?.decimalPlaces ?? 2
      return wrap(
        <>
          {label}
          <output className="form-field__calculation" htmlFor={id} id={id}>
            {field.calculation?.prefix || ''}
            {roundTo(Number(value) || 0, decimals).toFixed(Math.max(0, decimals))}
            {field.calculation?.suffix ? ` ${field.calculation.suffix}` : ''}
          </output>
        </>,
      )
    }

    case 'textarea':
      return wrap(
        <>
          {label}
          <textarea
            id={id}
            name={field.name}
            rows={5}
            required={field.required}
            placeholder={field.placeholder || undefined}
            aria-describedby={describedBy}
            maxLength={field.validation?.maxLength}
            value={String(value ?? '')}
            onChange={(event) => set(event.target.value)}
          />
        </>,
      )

    case 'select':
      return wrap(
        <>
          {label}
          <select id={id} name={field.name} required={field.required} aria-describedby={describedBy} value={String(value ?? '')} onChange={(event) => set(event.target.value)}>
            <option value="">{field.placeholder || 'Please choose...'}</option>
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>,
      )

    case 'radio':
      return wrap(
        <fieldset className="form-field__group">
          {legend}
          {(field.options || []).map((option) => (
            <label key={option.value} className="form-field__choice">
              <input type="radio" name={field.name} value={option.value} checked={String(value ?? '') === option.value} onChange={() => set(option.value)} />
              {option.label}
            </label>
          ))}
        </fieldset>,
      )

    case 'consent':
      return wrap(
        <label className="form-field__choice">
          <input id={id} type="checkbox" name={field.name} checked={value === true || value === 'true'} onChange={(event) => set(event.target.checked)} />
          <span>
            {field.label || 'I agree'}
            {field.consentLink ? (
              <>
                {' '}
                (<a href={field.consentLink} target="_blank" rel="noopener noreferrer">privacy policy</a>)
              </>
            ) : null}
            {required}
          </span>
        </label>,
      )

    case 'checkbox': {
      if ((field.options || []).length === 0) {
        return wrap(
          <label className="form-field__choice">
            <input id={id} type="checkbox" name={field.name} checked={value === true || value === 'true'} onChange={(event) => set(event.target.checked)} />
            <span>
              {field.label}
              {required}
            </span>
          </label>,
        )
      }
      const selected = Array.isArray(value) ? value.map(String) : []
      return wrap(
        <fieldset className="form-field__group">
          {legend}
          {(field.options || []).map((option) => (
            <label key={option.value} className="form-field__choice">
              <input
                type="checkbox"
                value={option.value}
                checked={selected.includes(String(option.value))}
                onChange={(event) => set(event.target.checked ? [...selected, String(option.value)] : selected.filter((entry) => entry !== option.value))}
              />
              {option.label}
            </label>
          ))}
        </fieldset>,
      )
    }

    case 'file':
      return wrap(
        <>
          {label}
          <input
            id={id}
            type="file"
            name={field.name}
            required={field.required}
            accept={field.accept || undefined}
            multiple={field.max !== undefined && field.max > 1}
            aria-describedby={describedBy}
            onChange={(event) => set(Array.from(event.target.files || []))}
          />
        </>,
      )

    case 'rating':
    case 'nps': {
      const isNps = field.type === 'nps'
      const start = isNps ? 0 : 1
      const end = isNps ? 10 : Math.max(3, Math.min(10, Math.floor(field.scaleMax || 5)))
      const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index)
      return wrap(
        <fieldset className="form-field__group">
          {legend}
          <div className="form-rating" role="group" aria-label={field.label}>
            {numbers.map((n) => (
              <button key={n} type="button" aria-pressed={String(value ?? '') === String(n)} onClick={() => set(n)}>
                {n}
              </button>
            ))}
          </div>
          {isNps && (
            <div className="form-rating__ends">
              <span>Not likely</span>
              <span>Very likely</span>
            </div>
          )}
        </fieldset>,
      )
    }

    case 'matrix': {
      const rows = field.rows || []
      const columns = field.options || []
      const answers = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {}
      return wrap(
        <fieldset className="form-field__group">
          {legend}
          <table className="form-matrix">
            <thead>
              <tr>
                <td />
                {columns.map((column) => (
                  <th key={column.value} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.value}>
                  <th scope="row">{row.label}</th>
                  {columns.map((column) => (
                    <td key={column.value}>
                      <input
                        type="radio"
                        name={`${id}-${row.value}`}
                        aria-label={`${row.label}: ${column.label}`}
                        checked={answers[String(row.value)] === column.value}
                        onChange={() => set({ ...answers, [String(row.value)]: column.value })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>,
      )
    }

    case 'appointment':
      return wrap(<AppointmentInput field={field} id={id} value={String(value ?? '')} onChange={set} label={label} />)

    case 'signature':
      return wrap(
        <fieldset className="form-field__group">
          {legend}
          <SignaturePad value={String(value ?? '')} onChange={set} inert={inert} />
        </fieldset>,
      )

    case 'address':
      return wrap(
        <fieldset className="form-field__group">
          {legend}
          <AddressInput field={field} id={id} value={value} onChange={set} inert={inert} />
        </fieldset>,
      )

    default: {
      const inputType =
        field.type === 'email'
          ? 'email'
          : field.type === 'phone'
            ? 'tel'
            : field.type === 'number'
              ? 'number'
              : field.type === 'date'
                ? 'date'
                : field.type === 'time'
                  ? 'time'
                  : field.type === 'datetime'
                    ? 'datetime-local'
                    : 'text'
      return wrap(
        <>
          {label}
          <input
            id={id}
            type={inputType}
            name={field.name}
            required={field.required}
            placeholder={field.placeholder || undefined}
            aria-describedby={describedBy}
            min={field.type === 'number' && typeof field.min === 'number' ? field.min : undefined}
            max={field.type === 'number' && typeof field.max === 'number' ? field.max : undefined}
            maxLength={inputType === 'text' ? field.validation?.maxLength : undefined}
            value={String(value ?? '')}
            onChange={(event) => set(event.target.value)}
          />
        </>,
      )
    }
  }
}

/* -------------------------------------------------------------------------- */

const pad = (n: number): string => String(n).padStart(2, '0')

const AppointmentInput: React.FC<{
  field: FormFieldDef
  id: string
  value: string
  onChange: (value: string) => void
  label: React.ReactNode
}> = ({ field, id, value, onChange, label }) => {
  const [date, time] = value.split(' ')
  const slots = (field.appointment?.slots || []).map((slot) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(slot.trim())
    return match ? `${pad(Number(match[1]))}:${match[2]}` : ''
  }).filter(Boolean)
  const weekdays = field.appointment?.weekdays?.length ? field.appointment.weekdays : [0, 1, 2, 3, 4, 5, 6]
  const horizon = Math.max(1, Math.min(730, field.appointment?.daysAhead ?? 60))
  const today = new Date()
  const minDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const max = new Date(today.getTime() + horizon * 86_400_000)
  const maxDate = `${max.getFullYear()}-${pad(max.getMonth() + 1)}-${pad(max.getDate())}`

  const dayOpen = (text: string): boolean => {
    const parts = text.split('-').map(Number)
    if (parts.length !== 3) return false
    return weekdays.includes(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay())
  }

  return (
    <>
      {label}
      <input
        id={id}
        type="date"
        min={minDate}
        max={maxDate}
        value={date || ''}
        onChange={(event) => {
          const next = event.target.value
          onChange(next ? `${next} ${time || ''}`.trim() : '')
        }}
      />
      {date && !dayOpen(date) && <small className="form-field__error">That day is not available.</small>}
      {slots.length > 0 ? (
        <div className="form-slots" role="group" aria-label="Times">
          {slots.map((slot) => (
            <button key={slot} type="button" aria-pressed={time === slot} onClick={() => date && onChange(`${date} ${slot}`)} disabled={!date}>
              {slot}
            </button>
          ))}
        </div>
      ) : (
        <input type="time" aria-label="Time" value={time || ''} onChange={(event) => date && onChange(`${date} ${event.target.value}`)} />
      )}
    </>
  )
}

const SignaturePad: React.FC<{ value: string; onChange: (value: string) => void; inert?: boolean }> = ({ value, onChange, inert }) => {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width, y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height }
  }

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    el.width = 600
    el.height = 210
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
    // Redraw a stored signature when the field mounts again (a step change).
    if (value) {
      const image = new Image()
      image.onload = () => ctx.drawImage(image, 0, 0)
      image.src = value
    }
    // Only on mount: later changes come from this canvas itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (inert) return
    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const p = point(event)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return
    const p = point(event)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  const up = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    onChange(event.currentTarget.toDataURL('image/png'))
  }
  const clear = () => {
    const el = canvas.current
    el?.getContext('2d')?.clearRect(0, 0, el.width, el.height)
    onChange('')
  }

  return (
    <div className="form-signature">
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Signature: draw with a finger or mouse" />
      <button type="button" className="form-signature__clear" onClick={clear}>
        Clear
      </button>
    </div>
  )
}

type Suggestion = { label: string; address: Record<string, string | number> }

const AddressInput: React.FC<{ field: FormFieldDef; id: string; value: unknown; onChange: (value: unknown) => void; inert?: boolean }> = ({ field, id, value, onChange, inert }) => {
  const current = (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string | number>) : {}) as Record<string, string | number>
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only the OpenStreetMap lookup is built in. A "google" choice needs a Places key the site does not store, so it behaves like plain fields.
  const lookup = field.addressLookup === 'nominatim' && !inert

  const update = useCallback((key: string, text: string) => onChange({ ...current, [key]: text }), [current, onChange])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const search = (text: string) => {
    update('line1', text)
    if (!lookup) return
    if (timer.current) clearTimeout(timer.current)
    if (text.trim().length < 4) {
      setSuggestions([])
      return
    }
    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(text)}`, { headers: { Accept: 'application/json' } })
        const rows = (await response.json()) as { display_name: string; lat: string; lon: string; address?: Record<string, string> }[]
        setSuggestions(
          rows.map((row) => {
            const a = row.address || {}
            return {
              label: row.display_name,
              address: {
                line1: [a.house_number, a.road].filter(Boolean).join(' ') || row.display_name.split(',')[0],
                city: a.city || a.town || a.village || a.suburb || '',
                region: a.state || '',
                postcode: a.postcode || '',
                country: a.country || '',
                lat: Number(row.lat),
                lon: Number(row.lon),
              },
            }
          }),
        )
      } catch {
        setSuggestions([])
      }
    }, 450)
  }

  return (
    <div className="form-address">
      <input id={id} type="text" placeholder="Street address" autoComplete="address-line1" value={String(current.line1 ?? '')} onChange={(event) => search(event.target.value)} />
      {suggestions.length > 0 && (
        <ul className="form-address__suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion.label}>
              <button
                type="button"
                onClick={() => {
                  onChange(suggestion.address)
                  setSuggestions([])
                }}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input type="text" placeholder="Apartment, suite (optional)" autoComplete="address-line2" value={String(current.line2 ?? '')} onChange={(event) => update('line2', event.target.value)} />
      <input type="text" placeholder="City" autoComplete="address-level2" value={String(current.city ?? '')} onChange={(event) => update('city', event.target.value)} />
      <input type="text" placeholder="State / region" autoComplete="address-level1" value={String(current.region ?? '')} onChange={(event) => update('region', event.target.value)} />
      <input type="text" placeholder="Postcode" autoComplete="postal-code" value={String(current.postcode ?? '')} onChange={(event) => update('postcode', event.target.value)} />
      <input type="text" placeholder="Country" autoComplete="country-name" value={String(current.country ?? '')} onChange={(event) => update('country', event.target.value)} />
    </div>
  )
}
