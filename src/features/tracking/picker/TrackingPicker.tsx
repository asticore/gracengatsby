'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { bestSelector, selectorCandidates, type SelectorCandidate } from './selector'
import { STANDARD_EVENTS, TRIGGER_TYPES, validateTrackingEvent, type StandardEvent, type TriggerType } from '../events'

/** Query flag that turns the picker on. Only an admin session also gets it (see SeoScripts). */
export const PICKER_PARAM = 'eg-event-picker'

export type TrackingPickerProps = {
  /** True when an admin session is open. Without it the component renders nothing. */
  adminSignedIn: boolean
  /** The admin root, to link to the tracking events list. */
  adminPath: string
  /** Link target for the events list, relative to the admin root. */
  eventsRoute: string
}

type Picked = { element: Element; candidates: SelectorCandidate[] }

const HOVER_OUTLINE = '2px solid #2563eb'

/**
 * Admin-only visual picker for tracking events. Hover outlines an element, click picks it and builds a selector,
 * a side panel names the event. The picker never sends anything: it shows the definition to copy into the tracking
 * events list. It runs only with an admin session and the flag in the URL, and it asks the browser not to index the
 * page.
 */
export function TrackingPicker({ adminSignedIn, adminPath, eventsRoute }: TrackingPickerProps): React.ReactElement | null {
  // The flag is read from the URL. The server render has no flag, so the picker never differs between server and client.
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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!active) return
    // Not indexed: the picker is for the admin only.
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
      if (!el || el.closest('[data-eg-picker-panel]')) return
      clear()
      hovered = el
      el.style.outline = HOVER_OUTLINE
    }
    const onClick = (ev: MouseEvent) => {
      const el = ev.target as Element | null
      if (!el || el.closest('[data-eg-picker-panel]')) return
      ev.preventDefault()
      ev.stopPropagation()
      clear()
      setPicked({ element: el, candidates: selectorCandidates(el) })
      setCopied(false)
    }
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('click', onClick, true)
    return () => {
      clear()
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [active])

  if (!active) return null

  const best = picked ? bestSelector(picked.element) : null
  const path = window.location.pathname
  const definition = {
    name: name.trim(),
    platformEvent,
    triggerType,
    selector: best?.selector ?? '',
    urlMatchMode: 'exact',
    urlMatch: path,
    enabled: true,
  }
  const errors = picked ? validateTrackingEvent(definition as never) : []

  return (
    <div data-eg-picker-panel="" style={{ position: 'fixed', right: 16, bottom: 16, width: 320, zIndex: 2147483000, background: '#fff', color: '#111', border: '1px solid #d1d5db', borderRadius: 8, padding: 12, font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
      <strong>Event picker</strong>
      <p style={{ margin: '6px 0' }}>Hover an element and click it to pick it.</p>
      {picked ? (
        <div>
          <div style={{ margin: '6px 0' }}>
            Selector: <code>{best?.selector}</code>
            <br />
            Matches on this page: {best?.matches ?? 0} {best && best.matches !== 1 ? '(not unique)' : ''}
          </div>
          <label style={{ display: 'block', margin: '6px 0' }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label style={{ display: 'block', margin: '6px 0' }}>
            Standard event
            <select value={platformEvent} onChange={(e) => setPlatformEvent(e.target.value as StandardEvent)} style={{ width: '100%' }}>
              {STANDARD_EVENTS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', margin: '6px 0' }}>
            Trigger
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)} style={{ width: '100%' }}>
              {TRIGGER_TYPES.filter((t) => t === 'click' || t === 'submit').map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <div style={{ margin: '6px 0' }}>URL rule: exact path <code>{path}</code></div>
          {errors.length ? <div style={{ color: '#b91c1c' }}>{errors.join(' ')}</div> : null}
          <button type="button" disabled={errors.length > 0} onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(definition, null, 2)); setCopied(true) }} style={{ marginTop: 6 }}>
            {copied ? 'Copied' : 'Copy event definition'}
          </button>{' '}
          <a href={`${adminPath}${eventsRoute}`} style={{ marginLeft: 6 }}>Open tracking events</a>
        </div>
      ) : null}
      <button type="button" onClick={() => setClosed(true)} style={{ marginTop: 8 }}>Close picker</button>
    </div>
  )
}
