'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { FormFieldDef, PublicFormConfig, SubmissionValues } from '../types'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { SectionBlock } from '@/components/blocks/SectionBlock'
import { StyledBlock } from '@/components/blocks/StyledBlock'
import type { SectionNode } from '@/lib/sectionTree'
import { applyCalculations, resolveVisibility } from '../conditions'
import { scopeClass, scopeCustomCss } from '../customCss'
import { roundTo } from '../expression'
import {
  HTML_ELEMENT,
  isFieldNode,
  isStepNode,
  splitLayoutIntoSteps,
  upgradeFieldsToLayout,
  type LayoutNode,
} from '../layout'
import { priceSubmission } from '../pricing'
import { HONEYPOT_FIELD, RECAPTCHA_FIELD, RENDERED_AT_FIELD, TURNSTILE_FIELD } from '../spam'
import { validateSubmission } from '../validate'
import { FieldView } from './FieldView'
import './forms.css'

/**
 * The front-end form: draws the layout tree (sections, columns, headings,
 * fields) and runs it.
 *
 * Conditional logic and calculations run here on every keystroke, using the
 * exact same functions the server uses when the form is submitted. That is the
 * point of keeping them pure and dependency-free: the visitor sees a form that
 * behaves live, and the server independently reaches the same conclusion about
 * what was visible and what the total is. The browser's answer is never
 * trusted - it is only what the visitor was shown.
 */

type Status = 'idle' | 'submitting' | 'success' | 'error'

type CaptchaApi = {
  turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string }
  grecaptcha?: { ready: (callback: () => void) => void; execute: (key: string, options: { action: string }) => Promise<string> }
}

const initialValues = (fields: FormFieldDef[], prefill: Record<string, string> | undefined): SubmissionValues => {
  const values: SubmissionValues = {}
  for (const field of fields || []) {
    if (!field?.name) continue
    if (field.type === 'checkbox' && (field.options || []).length > 0) {
      values[field.name] = field.defaultValue ? [field.defaultValue] : []
    } else if (field.type === 'checkbox' || field.type === 'consent') {
      values[field.name] = field.defaultValue === 'true'
    } else if (field.type === 'matrix' || field.type === 'address') {
      values[field.name] = {}
    } else {
      values[field.name] = field.defaultValue ?? ''
    }
    if (prefill && prefill[field.name] !== undefined) {
      values[field.name] = field.type === 'checkbox' && (field.options || []).length > 0 ? [prefill[field.name]] : prefill[field.name]
    }
  }
  return values
}

/** Pairs every field/HTML/step node with the flat definition it produced, in the same order walkLayout used. */
/**
 * What identifies a node after SectionBlock has copied it: its id, or failing
 * that its `props` object (the copy shares it by reference).
 */
const nodeKey = (node: { _id?: unknown; props?: unknown }): unknown => (typeof node._id === 'string' ? node._id : node.props)

function pairNodes(layout: LayoutNode[], fields: FormFieldDef[]): Map<unknown, FormFieldDef> {
  const pairs = new Map<unknown, FormFieldDef>()
  let cursor = 0
  const visit = (node: LayoutNode, topLevel: boolean) => {
    if (!node || typeof node !== 'object') return
    if (isStepNode(node)) {
      if (topLevel) cursor += 1
      return
    }
    if (isFieldNode(node) || (node.blockType === 'element' && node.elementType === HTML_ELEMENT)) {
      const field = fields[cursor]
      cursor += 1
      if (field) pairs.set(nodeKey(node), field)
      return
    }
    if (Array.isArray(node.columns)) {
      for (const column of node.columns) for (const child of column?.blocks || []) visit(child, false)
    }
  }
  layout.forEach((node) => visit(node, true))
  return pairs
}

function fieldsIn(nodes: LayoutNode[], pairs: Map<unknown, FormFieldDef>): FormFieldDef[] {
  const out: FormFieldDef[] = []
  const visit = (node: LayoutNode) => {
    if (!node || typeof node !== 'object') return
    const field = pairs.get(nodeKey(node))
    if (field) {
      out.push(field)
      return
    }
    if (Array.isArray(node.columns)) {
      for (const column of node.columns) for (const child of column?.blocks || []) visit(child)
    }
  }
  nodes.forEach(visit)
  return out
}

const safeRedirect = (url: string): string | null => {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

const loadScript = (src: string, marker: string): Promise<void> =>
  new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-eg="${marker}"]`)
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve()
      else existing.addEventListener('load', () => resolve())
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.eg = marker
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    })
    script.addEventListener('error', () => resolve())
    document.head.appendChild(script)
  })

export const FormRenderer: React.FC<{
  config: PublicFormConfig
  /** True on the /embed page: reports its height to the parent window. */
  embed?: boolean
}> = ({ config, embed }) => {
  const layout = useMemo<LayoutNode[]>(
    () => (Array.isArray(config.layout) && config.layout.length > 0 ? (config.layout as LayoutNode[]) : upgradeFieldsToLayout(config.fields)),
    [config.layout, config.fields],
  )
  const fields = useMemo(() => config.fields || [], [config.fields])
  const pairs = useMemo(() => pairNodes(layout, fields), [layout, fields])
  const steps = useMemo(() => splitLayoutIntoSteps(layout), [layout])
  const isMultiStep = steps.length > 1

  const [values, setValues] = useState<SubmissionValues>(() => initialValues(fields, config.prefill))
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stepIndex, setStepIndex] = useState(0)
  const [turnstileToken, setTurnstileToken] = useState('')

  const renderedAt = useRef<number>(0)
  const turnstileRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    renderedAt.current = Date.now()
  }, [])

  const computed = useMemo(() => applyCalculations(fields, values), [fields, values])
  const visible = useMemo(() => resolveVisibility(fields, computed), [fields, computed])

  const pricing = useMemo(
    () =>
      config.purchasable
        ? priceSubmission({ id: config.id, title: config.title, fields, payment: { purchasable: true, currency: config.currency } }, computed, visible)
        : null,
    [config, fields, computed, visible],
  )

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => {
      if (!previous[name]) return previous
      const next = { ...previous }
      delete next[name]
      return next
    })
  }, [])

  const captcha = config.captcha || (config.turnstileSiteKey ? { provider: 'turnstile' as const, siteKey: config.turnstileSiteKey } : undefined)

  /** Turnstile is rendered explicitly: its container is created by React, after the implicit scan has run. */
  useEffect(() => {
    if (captcha?.provider !== 'turnstile') return
    let cancelled = false
    void loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', 'turnstile').then(() => {
      const api = (window as unknown as CaptchaApi).turnstile
      if (cancelled || !api || !turnstileRef.current || turnstileRef.current.childElementCount > 0) return
      api.render(turnstileRef.current, { sitekey: captcha.siteKey, callback: (token: string) => setTurnstileToken(token) })
    })
    return () => {
      cancelled = true
    }
  }, [captcha?.provider, captcha?.siteKey])

  useEffect(() => {
    if (captcha?.provider !== 'recaptcha') return
    void loadScript(`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(captcha.siteKey)}`, 'recaptcha')
  }, [captcha?.provider, captcha?.siteKey])

  /** Tell the page that embeds this form how tall it is. Height only: no answers ever leave through here. */
  useEffect(() => {
    if (!embed || typeof ResizeObserver === 'undefined' || !rootRef.current) return
    const target = rootRef.current
    const post = () => window.parent?.postMessage({ type: 'eg-form-resize', key: config.key || String(config.id), height: Math.ceil(target.getBoundingClientRect().height) + 24 }, '*')
    const observer = new ResizeObserver(post)
    observer.observe(target)
    post()
    return () => observer.disconnect()
  }, [embed, config.key, config.id])

  const stepFields = useCallback((index: number): FormFieldDef[] => fieldsIn(steps[index] || [], pairs), [steps, pairs])

  /** The same rules the server applies, on the current step only, so a step cannot be skipped past. */
  const validateStep = (index: number): boolean => {
    const list = stepFields(index)
    const { errors: found } = validateSubmission(list, computed, visible)
    for (const field of list) {
      if (field.type !== 'file' || !field.name || !field.required || !visible.has(field.name)) continue
      const chosen = computed[field.name]
      if (!Array.isArray(chosen) || chosen.length === 0) found[field.name] = `${field.label || field.name} is required.`
    }
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const apiBase = (config.apiBase || '').replace(/\/$/, '')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'submitting') return
    if (!validateStep(stepIndex)) return

    setStatus('submitting')
    setMessage(null)
    setErrors({})

    const answers: Record<string, unknown> = {}
    const files: [string, File][] = []
    for (const [key, value] of Object.entries(computed)) {
      if (!visible.has(key)) continue
      if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
        for (const file of value as File[]) files.push([key, file])
        continue
      }
      if (Array.isArray(value) && value.some((entry) => entry instanceof File)) continue
      answers[key] = value
    }

    const system: Record<string, unknown> = { [HONEYPOT_FIELD]: '', [RENDERED_AT_FIELD]: renderedAt.current, eg_source: typeof document !== 'undefined' ? document.referrer || window.location.href : '' }
    if (turnstileToken) system[TURNSTILE_FIELD] = turnstileToken
    if (captcha?.provider === 'recaptcha') {
      const api = (window as unknown as CaptchaApi).grecaptcha
      if (api) {
        try {
          system[RECAPTCHA_FIELD] = await new Promise<string>((resolve, reject) => api.ready(() => api.execute(captcha.siteKey, { action: 'submit' }).then(resolve, reject)))
        } catch {
          // The server decides what a missing token means.
        }
      }
    }

    try {
      let init: RequestInit
      if (files.length > 0) {
        const body = new FormData()
        body.append('eg_json', JSON.stringify(answers))
        for (const [key, value] of Object.entries(system)) body.append(key, String(value))
        for (const [key, file] of files) body.append(key, file, file.name)
        init = { method: 'POST', body }
      } else {
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...answers, ...system }) }
      }

      const response = await fetch(`${apiBase}/api/forms/${encodeURIComponent(config.key || String(config.id))}/submit`, init)
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; message?: string; errors?: Record<string, string>; redirectUrl?: string } | null

      if (!response.ok || !body?.ok) {
        setErrors(body?.errors || {})
        setStatus('error')
        setMessage(body?.message || config.errorMessage)
        // Take the visitor to the first step that has an error.
        const firstBad = Object.keys(body?.errors || {})[0]
        if (firstBad) {
          const index = steps.findIndex((_, i) => stepFields(i).some((field) => field.name === firstBad))
          if (index >= 0) setStepIndex(index)
        }
        return
      }

      const target = body.redirectUrl ? safeRedirect(body.redirectUrl) : null
      if (target) {
        // In an embed the whole top page navigates, not just the frame.
        if (embed && window.top) window.top.location.assign(target)
        else window.location.assign(target)
        return
      }

      setStatus('success')
      setMessage(body.message || config.successMessage)
    } catch {
      setStatus('error')
      setMessage(config.errorMessage)
    }
  }

  const renderNode = useCallback(
    (node: SectionNode, key: string): React.ReactNode => {
      const layoutNode = node as unknown as LayoutNode
      const field = pairs.get(nodeKey(layoutNode))
      if (field) {
        if (field.type === 'html') {
          return <div key={key} className="form-field form-field--full form-field--html" dangerouslySetInnerHTML={{ __html: field.html || '' }} />
        }
        return (
          <FieldView
            key={key}
            field={field}
            value={computed[field.name || '']}
            error={errors[field.name || '']}
            hidden={Boolean(field.name) && !visible.has(field.name!)}
            onChange={setValue}
            idPrefix={`f${config.id}`}
            currency={config.currency}
          />
        )
      }
      if (node.blockType === 'element') {
        const props = ((node as { props?: unknown }).props || {}) as Record<string, unknown>
        const type = String((node as { elementType?: unknown }).elementType || '')
        if (type.startsWith('ff-')) return null
        return (
          <div key={key} className="form-block">
            {renderElement(type, props)}
          </div>
        )
      }
      return null
    },
    [pairs, computed, errors, visible, setValue, config.id, config.currency],
  )

  const drawNodes = (nodes: LayoutNode[]) =>
    nodes.map((node, index) => {
      const key = node._id || `n${index}`
      if (node.blockType === 'section') {
        return (
          <StyledBlock key={key} style={node.design} index={index}>
            <SectionBlock columns={node.columns} renderNode={renderNode} />
          </StyledBlock>
        )
      }
      return <StyledBlock key={key} style={node.design} index={index}>{renderNode(node as unknown as SectionNode, key)}</StyledBlock>
    })

  const scope = scopeClass(config.id)
  const css = scopeCustomCss(config.customCss, config.id)
  const presetClass = config.stylePreset && config.stylePreset !== 'theme' ? ` engage-form--${config.stylePreset}` : ''
  const accentStyle = config.accent ? ({ '--eg-accent': config.accent } as React.CSSProperties) : undefined

  if (status === 'success') {
    return (
      <div className={`engage-form engage-form--success${presetClass} ${scope}`} style={accentStyle} role="status" ref={rootRef}>
        {css && <style>{css}</style>}
        <p>{message}</p>
      </div>
    )
  }

  const lastStep = stepIndex === steps.length - 1
  const stepConfig = config.steps
  const titles = stepConfig?.titles || []
  const percent = Math.round(((stepIndex + 1) / steps.length) * 100)

  return (
    <div ref={rootRef}>
      <form className={`engage-form${presetClass} ${scope}`} style={accentStyle} onSubmit={handleSubmit} noValidate>
        {css && <style>{css}</style>}

        {isMultiStep && stepConfig?.showProgress !== false && (
          <div className="engage-form__progress">
            {stepConfig?.progressStyle === 'steps' ? (
              <ol className="engage-form__steps">
                {steps.map((_, index) => (
                  <li key={index} aria-current={index === stepIndex ? 'step' : undefined}>
                    {titles[index] || `Step ${index + 1}`}
                  </li>
                ))}
              </ol>
            ) : stepConfig?.progressStyle === 'text' ? (
              <p>
                Step {stepIndex + 1} of {steps.length}
                {titles[stepIndex] ? `: ${titles[stepIndex]}` : ''}
              </p>
            ) : (
              <div className="engage-form__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
                <span style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>
        )}

        {steps.map((nodes, index) => (
          <div key={index} className="engage-form__step" hidden={index !== stepIndex}>
            {drawNodes(nodes)}
          </div>
        ))}

        {/* Hidden with inline styles so it stays invisible even before the stylesheet loads; never focusable. */}
        {config.honeypot && (
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
            <label htmlFor={`${config.id}-${HONEYPOT_FIELD}`}>Leave this field empty</label>
            <input id={`${config.id}-${HONEYPOT_FIELD}`} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
        )}

        {captcha?.provider === 'turnstile' && <div className="engage-form__turnstile" ref={turnstileRef} />}

        {pricing && pricing.total > 0 && (
          <div className="engage-form__total">
            <span>Total</span>
            <strong>
              {pricing.currency} {roundTo(pricing.total, 2).toFixed(2)}
            </strong>
          </div>
        )}

        {message && status === 'error' && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}

        <div className="engage-form__actions">
          {isMultiStep && stepIndex > 0 && (
            <button type="button" className="btn" onClick={() => setStepIndex((index) => index - 1)}>
              {stepConfig?.backLabel || 'Back'}
            </button>
          )}
          {isMultiStep && !lastStep ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (validateStep(stepIndex)) setStepIndex((index) => index + 1)
              }}
            >
              {stepConfig?.nextLabel || 'Next'}
            </button>
          ) : (
            <button type="submit" className="btn btn--primary" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Sending…' : config.submitButtonLabel}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
