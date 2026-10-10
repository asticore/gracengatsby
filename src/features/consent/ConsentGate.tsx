'use client'

import React, { useState, useSyncExternalStore } from 'react'

import { CATEGORY_COPY, effectiveChoices, withCategory, type CookieCategory } from './consent'
import { type ConsentState, DEFAULT_POLICY_VERSION, getConsentState, saveConsent, SERVER_CONSENT_STATE, subscribeConsent } from './store'

import './consent.css'

export type ConsentGateProps = {
  /** The category that has to be granted before the children render. */
  category: Exclude<CookieCategory, 'necessary'>
  children: React.ReactNode
  title?: string
  description?: string
  acceptLabel?: string
  loadOnceLabel?: string
}

/**
 * Holds back an embed (a video, a map, a social post, an ad slot) until its
 * category is granted. Until then the children are not rendered at all, so the
 * third party gets no request.
 *
 * "Load once" shows the embed for this page view without saving a choice.
 * "Accept <category>" saves it, which also activates every other block gated
 * on that category across the page.
 */
export const ConsentGate = ({ category, children, title, description, acceptLabel, loadOnceLabel = 'Load once' }: ConsentGateProps) => {
  const consent = useSyncExternalStore(subscribeConsent, getConsentState, (): ConsentState => SERVER_CONSENT_STATE)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const current = effectiveChoices(consent.record, consent.policyVersion ?? DEFAULT_POLICY_VERSION, consent.defaultGranted)
  if (current[category] || loadedOnce) return <>{children}</>

  const copy = CATEGORY_COPY[category]
  const label = copy.label.toLowerCase()

  return (
    <div className="engage-consent-gate" role="region" aria-label={title ?? copy.label}>
      <p className="engage-consent-gate__text">
        {description ?? `This content comes from a third party and needs ${label} cookies. ${copy.description}`}
      </p>
      <div className="engage-consent-gate__actions">
        <button type="button" className="engage-consent__button" onClick={() => setLoadedOnce(true)}>
          {loadOnceLabel}
        </button>
        <button
          type="button"
          className="engage-consent__button engage-consent__button--primary"
          onClick={() => saveConsent(withCategory(current, category, true))}
        >
          {acceptLabel ?? `Accept ${label}`}
        </button>
      </div>
    </div>
  )
}
