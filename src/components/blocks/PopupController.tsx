'use client'

import { useEffect } from 'react'

import {
  frequencyAllows,
  hasAutoTrigger,
  hrefOpensPopup,
  isExitIntent,
  isLikelyBot,
  scrollThresholdReached,
  type AutoTriggers,
  type PopupSeen,
} from '@/lib/popupTriggers'
import type { PopupFrequency } from '@/lib/sectionLayout'

type Props = {
  /** Id of the checkbox that holds the popup's open state (the CSS-only mechanism). */
  toggleId: string
  /** The section anchor; links to '#popup-<anchorId>' open this popup. */
  anchorId?: string
  triggers: AutoTriggers
  frequency?: PopupFrequency
  days?: number
}

const AUTO_FLAG = '__beAutoPopupShown'
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not(.be-modal__toggle),select,textarea,[tabindex]:not([tabindex="-1"])'

function readSeen(key: string): PopupSeen {
  const seen: PopupSeen = {}
  try {
    const raw = window.localStorage.getItem(key)
    const n = raw === null ? NaN : Number(raw)
    if (Number.isFinite(n)) seen.lastShownMs = n
  } catch {}
  try {
    seen.shownThisSession = window.sessionStorage.getItem(key) === '1'
  } catch {}
  return seen
}

function writeSeen(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {}
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {}
}

/**
 * Enhances a CSS-only popup (see SectionBlock). The checkbox stays the source of truth, so the label
 * trigger, backdrop and close button keep working without it; this adds Escape, focus trap and return,
 * scroll lock, '#popup-<id>' links and the automatic triggers (timer, scroll, exit intent).
 */
export default function PopupController({ toggleId, anchorId, triggers, frequency, days }: Props): null {
  useEffect(() => {
    const toggle = document.getElementById(toggleId) as HTMLInputElement | null
    if (!toggle) return
    const panel = toggle.parentElement?.querySelector<HTMLElement>('.be-modal__panel') ?? null
    const storageKey = `be-popup:${toggleId}`
    let returnFocus: HTMLElement | null = null
    let previousOverflow = ''
    let locked = false
    const cleanups: Array<() => void> = []

    const setOpen = (open: boolean) => {
      if (toggle.checked === open) return
      toggle.checked = open
      toggle.dispatchEvent(new Event('change', { bubbles: true }))
    }

    const onOpened = () => {
      if (locked) return
      locked = true
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      if (panel) {
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
        const first = panel.querySelector<HTMLElement>(FOCUSABLE)
        ;(first ?? panel).focus({ preventScroll: true })
      }
    }
    const onClosed = () => {
      if (!locked) return
      locked = false
      document.body.style.overflow = previousOverflow
      const target = returnFocus && document.contains(returnFocus) ? returnFocus : toggle
      returnFocus = null
      target.focus({ preventScroll: true })
    }
    const onChange = () => (toggle.checked ? onOpened() : onClosed())
    toggle.addEventListener('change', onChange)
    cleanups.push(() => toggle.removeEventListener('change', onChange))
    cleanups.push(() => {
      if (locked) document.body.style.overflow = previousOverflow
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (!toggle.checked) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    cleanups.push(() => document.removeEventListener('keydown', onKeyDown))

    // Any link or button whose href is '#popup-<anchor>' opens this popup.
    if (anchorId) {
      const onClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target.closest('a[href]') : null
        if (!target || !hrefOpensPopup(target.getAttribute('href'), anchorId)) return
        event.preventDefault()
        setOpen(true)
      }
      document.addEventListener('click', onClick)
      cleanups.push(() => document.removeEventListener('click', onClick))
      if (hrefOpensPopup(window.location.hash, anchorId)) setOpen(true)
    }

    // Automatic triggers: never for crawlers / automation, one per page view, and subject to frequency.
    if (hasAutoTrigger(triggers) && !isLikelyBot(navigator.userAgent, navigator.webdriver)) {
      const w = window as unknown as Record<string, unknown>
      let done = false
      const fire = () => {
        if (done || w[AUTO_FLAG] || toggle.checked) return
        if (!frequencyAllows(frequency, days, readSeen(storageKey), Date.now())) return
        done = true
        w[AUTO_FLAG] = true
        writeSeen(storageKey)
        setOpen(true)
      }
      if (triggers.delaySec !== undefined) {
        const timer = window.setTimeout(fire, triggers.delaySec * 1000)
        cleanups.push(() => window.clearTimeout(timer))
      }
      const pct = triggers.scrollPct
      if (pct !== undefined) {
        const onScroll = () => {
          const doc = document.documentElement
          if (scrollThresholdReached(window.scrollY, window.innerHeight, doc.scrollHeight, pct)) fire()
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        cleanups.push(() => window.removeEventListener('scroll', onScroll))
      }
      if (triggers.exit && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        const onLeave = (event: MouseEvent) => {
          if (isExitIntent(event.clientY, event.relatedTarget === null)) fire()
        }
        document.documentElement.addEventListener('mouseleave', onLeave)
        cleanups.push(() => document.documentElement.removeEventListener('mouseleave', onLeave))
      }
    }

    return () => cleanups.forEach((fn) => fn())
    // The trigger object is rebuilt each render; its values are primitives, so depend on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleId, anchorId, triggers.delaySec, triggers.scrollPct, triggers.exit, frequency, days])

  return null
}
