'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { FormFieldDef, PublicFormConfig, SubmissionValues } from '../types'

import { applyCalculations, resolveVisibility, splitIntoPages } from '../conditions'
import { roundTo } from '../expression'
import { priceSubmission } from '../pricing'
import { HONEYPOT_FIELD, RENDERED_AT_FIELD, TURNSTILE_FIELD } from '../spam'

/**
 * The front-end form.
 *
 * Conditional logic and calculations run here on every keystroke, using the
 * exact same functions the server uses when the form is submitted. That is the
 * point of keeping them pure and dependency-free: the visitor sees a form that
 * behaves live, and the server independently reaches the same conclusion about
 * what was visible and what the total is. The browser's answer is never
 * trusted - it is only what the visitor was shown.
 */

const WIDTH_CLASS: Record<string, string> = {
  full: 'form-field--full',
  half: 'form-field--half',
  third: 'form-field--third',
  twoThirds: 'form-field--two-thirds',
  quarter: 'form-field--quarter',
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

type TurnstileApi = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string
  reset: (id?: string) => void
}

const initialValues = (fields: FormFieldDef[]): SubmissionValues => {
  const values: SubmissionValues = {}
  for (const field of fields || []) {
    if (!field?.name) continue
    if (field.type === 'checkbox' && (field.options || []).length > 0) {
      values[field.name] = field.defaultValue ? [field.defaultValue] : []
    } else if (field.type === 'checkbox') {
      values[field.name] = field.defaultValue === 'true'
    } else {
      values[field.name] = field.defaultValue ?? ''
    }
  }
  return values
}

export const FormRenderer: React.FC<{ config: PublicFormConfig }> = ({ config }) => {
  const fields = useMemo(() => config.fields || [], [config.fields])

  const [values, setValues] = useState<SubmissionValues>(() => initialValues(fields))
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pageIndex, setPageIndex] = useState(0)
  const [turnstileToken, setTurnstileToken] = useState('')

  // Captured once, when the form first draws, and posted back so the server can
  // tell how long it took to fill in. A ref rather than state: it must never
  // change, and it must not cause a re-render. Filled in an effect rather than
  // inline, because reading the clock during render is not idempotent - and
  // during hydration would give a different answer on the client than the
  // server already committed to.
  const renderedAt = useRef<number>(0)
  const turnstileRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    renderedAt.current = Date.now()
  }, [])

  const computed = useMemo(() => applyCalculations(fields, values), [fields, values])
  const visible = useMemo(() => resolveVisibility(fields, computed), [fields, computed])

  const pricing = useMemo(
    () =>
      config.purchasable
        ? priceSubmission(
            { id: config.id, title: config.title, fields, payment: { purchasable: true, currency: config.currency } },
            computed,
            visible,
          )
        : null,
    [config, fields, computed, visible],
  )

  const pages = useMemo(() => splitIntoPages(fields), [fields])
  const isMultiStep = pages.length > 1

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => {
      if (!previous[name]) return previous
      const next = { ...previous }
      delete next[name]
      return next
    })
  }, [])

  /**
   * Turnstile is rendered explicitly rather than by the script scanning the
   * page: the widget's container is created by React, which the implicit
   * scanner has usually already run past by the time it exists.
   */
  useEffect(() => {
    if (!config.turnstileSiteKey || !turnstileRef.current) return

    let cancelled = false

    const mount = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
      if (cancelled || !api || !turnstileRef.current || turnstileRef.current.childElementCount > 0) return
      api.render(turnstileRef.current, {
        sitekey: config.turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
      })
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-eg-turnstile]')
    if (existing) {
      if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) mount()
      else existing.addEventListener('load', mount)
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.egTurnstile = 'true'
      script.addEventListener('load', mount)
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
    }
  }, [config.turnstileSiteKey])

  /** Required fields on the current page only, so a step cannot be skipped past. */
  const validatePage = (index: number): boolean => {
    const found: Record<string, string> = {}
    for (const field of pages[index] || []) {
      if (!field?.name || !field.required || !visible.has(field.name)) continue
      const value = computed[field.name]
      const blank =
        value === null ||
        value === undefined ||
        (Array.isArray(value) ? value.length === 0 : String(value).trim() === '') ||
        value === false
      if (blank) found[field.name] = `${field.label || field.name} is required.`
    }
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'submitting') return
    if (!validatePage(pageIndex)) return

    setStatus('submitting')
    setMessage(null)
    setErrors({})

    // Only what the visitor could actually see is sent. The server drops hidden
    // fields again regardless - this just keeps the request honest.
    const submission: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(computed)) {
      if (visible.has(key)) submission[key] = value
    }

    submission[HONEYPOT_FIELD] = ''
    submission[RENDERED_AT_FIELD] = renderedAt.current
    if (turnstileToken) submission[TURNSTILE_FIELD] = turnstileToken

    try {
      const response = await fetch(`/api/forms/${config.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      })

      const body = (await response.json().catch((): null => null)) as {
        ok?: boolean
        message?: string
        errors?: Record<string, string>
        redirectUrl?: string
      } | null

      if (!response.ok || !body?.ok) {
        setErrors(body?.errors || {})
        setStatus('error')
        setMessage(body?.message || config.errorMessage)
        return
      }

      if (body.redirectUrl) {
        window.location.assign(body.redirectUrl)
        return
      }

      setStatus('success')
      setMessage(body.message || config.successMessage)
    } catch {
      setStatus('error')
      setMessage(config.errorMessage)
    }
  }

  if (status === 'success') {
    return (
      <div className="engage-form engage-form--success" role="status">
        <p>{message}</p>
      </div>
    )
  }

  const currentPage = pages[pageIndex] || []
  const isLastPage = pageIndex === pages.length - 1

  return (
    <form className="engage-form" onSubmit={handleSubmit} noValidate>
      {isMultiStep && (
        <p className="engage-form__progress">
          Step {pageIndex + 1} of {pages.length}
        </p>
      )}

      <div className="engage-form__fields">
        {currentPage.map((field, index) => (
          <FieldView
            key={field.name || field.id || `${field.type}-${index}`}
            field={field}
            value={computed[field.name]}
            error={errors[field.name]}
            hidden={Boolean(field.name) && !visible.has(field.name)}
            onChange={setValue}
          />
        ))}
      </div>

      {/*
        The honeypot. Hidden with inline styles rather than a class so it stays
        invisible even where the site's stylesheet has not loaded, and marked
        aria-hidden with tabIndex -1 so a screen reader or keyboard user never
        lands on it and fills it in by accident.
      */}
      {config.honeypot && (
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
          <label htmlFor={`${config.id}-${HONEYPOT_FIELD}`}>Leave this field empty</label>
          <input
            id={`${config.id}-${HONEYPOT_FIELD}`}
            name={HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
      )}

      {config.turnstileSiteKey && <div className="engage-form__turnstile" ref={turnstileRef} />}

      {pricing && pricing.total > 0 && (
        <div className="engage-form__total">
          <span>Total</span>
          <strong>
            {pricing.currency} {roundTo(pricing.total, 2).toFixed(2)}
          </strong>
        </div>
      )}

      {message && status === 'error' && <p className="form-error">{message}</p>}

      <div className="engage-form__actions">
        {isMultiStep && pageIndex > 0 && (
          <button type="button" className="btn" onClick={() => setPageIndex((page) => page - 1)}>
            Back
          </button>
        )}

        {isMultiStep && !isLastPage ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              if (validatePage(pageIndex)) setPageIndex((page) => page + 1)
            }}
          >
            Next
          </button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Sending…' : config.submitButtonLabel}
          </button>
        )}
      </div>
    </form>
  )
}

const FieldView: React.FC<{
  field: FormFieldDef
  value: unknown
  error?: string
  hidden: boolean
  onChange: (name: string, value: unknown) => void
}> = ({ field, value, error, hidden, onChange }) => {
  if (hidden) return null

  const width = WIDTH_CLASS[field.width || 'full'] || WIDTH_CLASS.full
  const id = `field-${field.name || field.id}`
  const describedBy = field.helpText ? `${id}-help` : undefined

  const wrap = (children: React.ReactNode) => (
    <div className={`form-field ${width}${error ? ' form-field--error' : ''}`}>
      {children}
      {field.helpText && (
        <small className="form-field__help" id={describedBy}>
          {field.helpText}
        </small>
      )}
      {error && <small className="form-field__error">{error}</small>}
    </div>
  )

  const label = (
    <label htmlFor={id}>
      {field.label}
      {field.required && <abbr title="required"> *</abbr>}
    </label>
  )

  switch (field.type) {
    case 'section':
      return (
        <div className={`form-field ${WIDTH_CLASS.full} form-field--section`}>
          {field.label && <h3>{field.label}</h3>}
          {/*
            Author-written markup, rendered as written. Only site admins can
            edit a form, so this is the same trust level as the rich-text
            content elsewhere on the page - but it is worth being explicit that
            nothing here is escaped.
          */}
          {field.html && <div dangerouslySetInnerHTML={{ __html: field.html }} />}
        </div>
      )

    case 'html':
      return (
        <div
          className={`form-field ${width} form-field--html`}
          dangerouslySetInnerHTML={{ __html: field.html || '' }}
        />
      )

    case 'page':
      return null

    case 'hidden':
      return <input type="hidden" name={field.name} value={String(value ?? '')} readOnly />

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
            value={String(value ?? '')}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
        </>,
      )

    case 'select':
      return wrap(
        <>
          {label}
          <select
            id={id}
            name={field.name}
            required={field.required}
            aria-describedby={describedBy}
            value={String(value ?? '')}
            onChange={(event) => onChange(field.name, event.target.value)}
          >
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
          <legend>
            {field.label}
            {field.required && <abbr title="required"> *</abbr>}
          </legend>
          {(field.options || []).map((option) => (
            <label key={option.value} className="form-field__choice">
              <input
                type="radio"
                name={field.name}
                value={option.value}
                checked={String(value ?? '') === option.value}
                onChange={() => onChange(field.name, option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>,
      )

    case 'checkbox': {
      // Two quite different controls share one type, as they do in every form
      // builder: with options it is a multi-select group, without them it is a
      // single yes/no consent box.
      if ((field.options || []).length === 0) {
        return wrap(
          <label className="form-field__choice">
            <input
              id={id}
              type="checkbox"
              name={field.name}
              checked={value === true || value === 'true'}
              onChange={(event) => onChange(field.name, event.target.checked)}
            />
            {field.label}
            {field.required && <abbr title="required"> *</abbr>}
          </label>,
        )
      }

      const selected = Array.isArray(value) ? value.map(String) : []

      return wrap(
        <fieldset className="form-field__group">
          <legend>
            {field.label}
            {field.required && <abbr title="required"> *</abbr>}
          </legend>
          {(field.options || []).map((option) => (
            <label key={option.value} className="form-field__choice">
              <input
                type="checkbox"
                value={option.value}
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    field.name,
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((entry) => entry !== option.value),
                  )
                }
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
            aria-describedby={describedBy}
            // Only the filename travels - see the note in submitEndpoint.ts.
            onChange={(event) => onChange(field.name, event.target.files?.[0]?.name || '')}
          />
        </>,
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
            value={String(value ?? '')}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
        </>,
      )
    }
  }
}
