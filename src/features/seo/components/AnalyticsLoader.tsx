'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { CONSENT_EVENT, CONSENT_STORAGE_KEY, type ConsentValue } from '../consent'

export type AnalyticsIds = {
  gtmContainerId?: string
  ga4MeasurementId?: string
  metaPixelId?: string
}

export type AnalyticsLoaderProps = AnalyticsIds & {
  requireConsent: boolean
}

/**
 * Consent is kept in localStorage rather than a cookie: nothing server-side
 * needs to read it (the tags are injected in the browser either way), and a
 * cookie set purely to remember that cookies were refused is the exact thing
 * the flag exists to avoid.
 */
const readConsent = (): ConsentValue | null => {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    return null
  }
}

const writeConsent = (value: ConsentValue) => {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value)
  } catch {
    // Private browsing and blocked storage both land here. The choice applies
    // to this page view and is simply asked again next time.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
}

const appendScript = (attributes: Record<string, string>, inline?: string) => {
  const script = document.createElement('script')
  Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value))
  if (inline) script.text = inline
  document.head.appendChild(script)
}

// One injection per page load, however many times the component re-renders.
let injected = false

const injectTags = ({ gtmContainerId, ga4MeasurementId, metaPixelId }: AnalyticsIds) => {
  if (injected) return
  injected = true

  const w = window as unknown as Record<string, unknown>

  if (gtmContainerId) {
    w.dataLayer = (w.dataLayer as unknown[]) || []
    ;(w.dataLayer as unknown[]).push({ 'gtm.start': Date.now(), event: 'gtm.js' })
    appendScript({
      async: 'true',
      src: `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmContainerId)}`,
    })
  }

  if (ga4MeasurementId) {
    appendScript({
      async: 'true',
      src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`,
    })
    appendScript(
      {},
      `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
        `gtag('js',new Date());gtag('config',${JSON.stringify(ga4MeasurementId)});`,
    )
  }

  if (metaPixelId) {
    appendScript(
      {},
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
        `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
        `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
        `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
        `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
        `fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`,
    )
  }
}

const bannerStyles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 2147483000,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.9rem 1.25rem',
    background: '#111',
    color: '#fff',
    font: '400 0.875rem/1.4 system-ui, sans-serif',
  },
  text: { margin: 0, maxWidth: '48rem' },
  button: {
    cursor: 'pointer',
    border: '1px solid #fff',
    borderRadius: '999px',
    padding: '0.4rem 1.1rem',
    font: 'inherit',
    background: 'transparent',
    color: '#fff',
  },
  accept: {
    cursor: 'pointer',
    border: '1px solid #fff',
    borderRadius: '999px',
    padding: '0.4rem 1.1rem',
    font: 'inherit',
    background: '#fff',
    color: '#111',
  },
}

/**
 * Injects the analytics tags in the browser, never in the server render.
 *
 * Doing it client-side is what makes the consent flag enforceable: when it is
 * on, no third-party request is made and no tag is in the document until the
 * visitor has actually said yes. Server-rendering the snippets and hiding them
 * behind a banner would still have loaded them.
 */
export const AnalyticsLoader: React.FC<AnalyticsLoaderProps> = ({ requireConsent, ...ids }) => {
  const [askConsent, setAskConsent] = useState(false)

  useEffect(() => {
    if (!ids.gtmContainerId && !ids.ga4MeasurementId && !ids.metaPixelId) return

    if (!requireConsent) {
      injectTags(ids)
      return
    }

    const decision = readConsent()
    if (decision === 'granted') {
      injectTags(ids)
      return
    }
    if (decision === 'denied') return

    // Deferred rather than set straight away: showing the banner is a second
    // render, and doing that synchronously inside the effect makes it cascade
    // off the first paint. A microtask is late enough to avoid that and early
    // enough that nobody sees a gap. The flag guards against the component
    // unmounting in between.
    let live = true
    queueMicrotask(() => {
      if (live) setAskConsent(true)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireConsent, ids.gtmContainerId, ids.ga4MeasurementId, ids.metaPixelId])

  const decide = useCallback(
    (value: ConsentValue) => {
      writeConsent(value)
      setAskConsent(false)
      if (value === 'granted') injectTags(ids)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [ids.gtmContainerId, ids.ga4MeasurementId, ids.metaPixelId],
  )

  if (!askConsent) return null

  return (
    <div role="dialog" aria-label="Cookie consent" style={bannerStyles.bar}>
      <p style={bannerStyles.text}>
        We use cookies to understand how this site is used. Nothing is loaded until you agree.
      </p>
      <button type="button" style={bannerStyles.button} onClick={() => decide('denied')}>
        Decline
      </button>
      <button type="button" style={bannerStyles.accept} onClick={() => decide('granted')}>
        Accept
      </button>
    </div>
  )
}
