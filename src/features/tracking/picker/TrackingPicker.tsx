'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { STANDARD_EVENTS, TRIGGER_TYPES, validateTrackingEvent, type StandardEvent, type TrackingEventDef, type TriggerType } from '../events'
import { matchSelector } from '../runtime'
import { bestSelector, selectorCandidates, type SelectorCandidate } from './selector'

/** Query flag that turns the picker on. Only a signed-in admin gets it (see SeoScripts). */
export const PICKER_PARAM = 'eg-event-picker'
const TOAST_MS = 4000

/** Every visible string in the picker, translated on the server (uiStrings `tracking.picker.*`). */
export type PickerLabels = Record<
  | 'title'
  | 'hint'
  | 'selector'
  | 'matches'
  | 'notUnique'
  | 'name'
  | 'standardEvent'
  | 'trigger'
  | 'urlRule'
  | 'save'
  | 'saving'
  | 'saved'
  | 'saveFailed'
  | 'testMode'
  | 'testFired'
  | 'openEvents'
  | 'close'
  | 'copy'
  | 'copied',
  string
>

export type TrackingPickerProps = {
  /** True when a signed-in admin is confirmed on the server. Without it the component renders nothing. */
  adminSignedIn: boolean
  /** The admin root, to link to the tracking events list. */
  adminPath: string
  /** Link target for the events list, relative to the admin root. */
  eventsRoute: string
  /** The admin endpoint that creates an event. */
  saveEndpoint: string
  labels: PickerLabels
}

type Picked = { element: Element; candidates: SelectorCandidate[] }

const HOVER_OUTLINE = '2px solid #2563eb'

/**
 * Admin-only visual picker for tracking events. Hover outlines an element; a click picks it and builds a selector;
 * a side panel names the event and saves it through the admin endpoint. Test mode shows a toast when the picked
 * element is clicked, as the event would fire. Runs only with a real admin session and ?eg-event-picker=1; the page
 * is marked noindex by the server and in the browser.
 */
export function TrackingPicker({ adminSignedIn, adminPath, eventsRoute, saveEndpoint, labels }: TrackingPickerProps): React.ReactElement | null {
  // The flag is read from the URL. The server render has no flag, so server and client render the same first frame.
  const flagOn = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get(PICKER_PARAM) === '1',
    () => false,
  )
  const [closed, setClosed] = useState(false)
  const active = adminSignedIn && flagOn && !closed
  const [picked, setPicked] = useState<Picked | null>(null)
  const [name, setName] = useState('')
  const [platformEvent, setPlatformEvent] = useState<StandardEvent>('Custom')
  const [triggerType, setTriggerType] = useState<TriggerType>('click')
  const [testMode, setTestMode] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!active) return
    // Not indexed: the picker is for the admin only. The server sends the same header for this query.
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
    const created = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    const previous = robots.content
    robots.content = 'noindex,nofollow'
    return () => {
      if (created) robots?.remove()
      else if (robots) robots.content = previous
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    let hovered: HTMLElement | null = null
    const clear = () => {
      if (hovered) hovered.style.outline = ''
      hovered = null
    }
    const onOver = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null
      if (!el || el.closest('[data-eg-picker-panel]') || testMode) return
      clear()
      hovered = el
      el.style.outline = HOVER_OUTLINE
    }
    const onClick = (ev: MouseEvent) => {
      const el = ev.target as Element | null
      if (!el || el.closest('[data-eg-picker-panel]') || testMode) return
      ev.preventDefault()
      ev.stopPropagation()
      clear()
      setPicked({ element: el, candidates: selectorCandidates(el) })
      setStatus({ kind: 'idle' })
      setCopied(false)
    }
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('click', onClick, true)
    return () => {
      clear()
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [active, testMode])

  // Test mode: a click on the picked element shows a toast, as the event would fire. Nothing is sent anywhere.
  const pickedSelector = picked ? bestSelector(picked.element)?.selector ?? null : null
  useEffect(() => {
    if (!active || !testMode || !pickedSelector) return
    const onClick = (ev: MouseEvent) => {
      if (!matchSelector(pickedSelector, ev.target as Element | null)) return
      setToast(`${labels.testFired}: ${name.trim() || platformEvent}`)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [active, testMode, pickedSelector, name, platformEvent, labels.testFired])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  if (!active) return null

  const best = picked ? bestSelector(picked.element) : null
  const path = window.location.pathname
  const definition: Partial<TrackingEventDef> = {
    name: name.trim(),
    platformEvent,
    triggerType,
    selector: best?.selector ?? '',
    urlMatchMode: 'exact',
    urlMatch: path,
    enabled: true,
  }
  const errors = picked ? validateTrackingEvent(definition as TrackingEventDef) : []

  const save = async () => {
    setStatus({ kind: 'saving' })
    try {
      const response = await fetch(saveEndpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(definition),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setStatus({ kind: 'error', message: body.error ?? labels.saveFailed })
        return
      }
      setStatus({ kind: 'saved' })
    } catch {
      setStatus({ kind: 'error', message: labels.saveFailed })
    }
  }

  return (
    <>
      {toast ? (
        <div role="status" data-eg-picker-panel="" style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 2147483000, background: '#111', color: '#fff', padding: '8px 12px', borderRadius: 6, font: '13px/1.4 system-ui, sans-serif' }}>
          {toast}
        </div>
      ) : null}
      <div data-eg-picker-panel="" style={{ position: 'fixed', right: 16, bottom: 16, width: 320, zIndex: 2147483000, background: '#fff', color: '#111', border: '1px solid #d1d5db', borderRadius: 8, padding: 12, font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
        <strong>{labels.title}</strong>
        <p style={{ margin: '6px 0' }}>{labels.hint}</p>
        <label style={{ display: 'block', margin: '6px 0' }}>
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} /> {labels.testMode}
        </label>
        {picked ? (
          <div>
            <div style={{ margin: '6px 0' }}>
              {labels.selector}: <code>{best?.selector}</code>
              <br />
              {labels.matches}: {best?.matches ?? 0} {best && best.matches !== 1 ? `(${labels.notUnique})` : ''}
            </div>
            <label style={{ display: 'block', margin: '6px 0' }}>
              {labels.name}
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', margin: '6px 0' }}>
              {labels.standardEvent}
              <select value={platformEvent} onChange={(e) => setPlatformEvent(e.target.value as StandardEvent)} style={{ width: '100%' }}>
                {STANDARD_EVENTS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', margin: '6px 0' }}>
              {labels.trigger}
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)} style={{ width: '100%' }}>
                {TRIGGER_TYPES.filter((t) => t === 'click' || t === 'submit').map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <div style={{ margin: '6px 0' }}>
              {labels.urlRule}: <code>{path}</code>
            </div>
            {errors.length ? <div style={{ color: '#b91c1c' }}>{errors.join(' ')}</div> : null}
            <button type="button" disabled={errors.length > 0 || status.kind === 'saving'} onClick={() => void save()} style={{ marginTop: 6 }}>
              {status.kind === 'saving' ? labels.saving : labels.save}
            </button>{' '}
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(definition, null, 2)); setCopied(true) }} style={{ marginTop: 6 }}>
              {copied ? labels.copied : labels.copy}
            </button>
            {status.kind === 'saved' ? <div style={{ color: '#15803d' }}>{labels.saved}</div> : null}
            {status.kind === 'error' ? <div style={{ color: '#b91c1c' }}>{status.message}</div> : null}
            <div style={{ marginTop: 6 }}>
              <a href={`${adminPath}${eventsRoute}`}>{labels.openEvents}</a>
            </div>
          </div>
        ) : null}
        <button type="button" onClick={() => setClosed(true)} style={{ marginTop: 8 }}>
          {labels.close}
        </button>
      </div>
    </>
  )
}
