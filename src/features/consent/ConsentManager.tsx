'use client'

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

import {
  allChoices,
  CATEGORY_COPY,
  CONSENT_CATEGORIES,
  effectiveChoices,
  isCurrentRecord,
  withCategory,
  type ConsentChoices,
  type CookieCategory,
} from './consent'
import type { ConsentConfig } from './config'
import { activateGatedMarkup } from './gate'
import { configureConsent, type ConsentState, getConsentState, saveConsent, SERVER_CONSENT_STATE, subscribeConsent } from './store'

import './consent.css'

/** Fired on window to open the Customise dialog from any script. */
export const COOKIE_SETTINGS_EVENT = 'engage:open-cookie-settings'

/** Opens the cookie settings dialog. Safe to call from any client component. */
export function openCookieSettings(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))
}

export type ConsentManagerProps = {
  config: ConsentConfig
  /** Visitor must choose before optional tags load. */
  optIn: boolean
  /** Whether the server could see a current choice in the cookie (avoids a banner flash). */
  initialDecided: boolean
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

const colourVariables = (config: ConsentConfig): CSSProperties => {
  const vars: Record<string, string> = {}
  if (config.bannerBackground) vars['--engage-consent-bg'] = config.bannerBackground
  if (config.bannerTextColor) vars['--engage-consent-fg'] = config.bannerTextColor
  if (config.buttonColor) vars['--engage-consent-btn'] = config.buttonColor
  return vars as CSSProperties
}

/**
 * The cookie banner, the Customise dialog and the "Cookie settings" link, and
 * the activation of custom scripts and gated embeds once a category is granted.
 *
 * Renders nothing when consent is switched off in settings. The effects still
 * run in that case, so custom code gated as "necessary" or with consent off
 * is activated as normal.
 */
export const ConsentManager = ({ config, optIn, initialDecided }: ConsentManagerProps) => {
  const consent = useSyncExternalStore(subscribeConsent, getConsentState, (): ConsentState => SERVER_CONSENT_STATE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<ConsentChoices>(() => allChoices(false))
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const { policyVersion, logConsent } = config
  const decided = consent.loaded ? isCurrentRecord(consent.record, policyVersion) : initialDecided
  const choices = effectiveChoices(consent.record, policyVersion, !optIn)
  const choicesKey = JSON.stringify(choices)

  useEffect(() => {
    configureConsent({ policyVersion, defaultGranted: !optIn, logConsent })
  }, [policyVersion, optIn, logConsent])

  useEffect(() => {
    activateGatedMarkup(document, JSON.parse(choicesKey) as ConsentChoices)
  }, [choicesKey])

  const openSettings = useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDraft(effectiveChoices(getConsentState().record, policyVersion, !optIn))
    setDialogOpen(true)
  }, [policyVersion, optIn])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-cookie-settings]') : null
      if (!target) return
      event.preventDefault()
      openSettings()
    }
    document.addEventListener('click', onClick)
    window.addEventListener(COOKIE_SETTINGS_EVENT, openSettings)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener(COOKIE_SETTINGS_EVENT, openSettings)
    }
  }, [openSettings])

  // Focus moves into the dialog when it opens and back to its opener when it closes.
  useEffect(() => {
    if (dialogOpen) {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
      return
    }
    openerRef.current?.focus()
    openerRef.current = null
  }, [dialogOpen])

  if (!config.enabled) return null

  const decide = (next: ConsentChoices) => {
    const before = effectiveChoices(getConsentState().record, policyVersion, !optIn)
    const withdrew = (before.analytics && !next.analytics) || (before.marketing && !next.marketing)
    saveConsent(next)
    setDialogOpen(false)
    // A tag already in the page cannot be unloaded. Withdrawing analytics or
    // marketing reloads the page, so the refusal applies to every tag at once.
    if (withdrew && typeof window !== 'undefined') window.location.reload()
  }

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Escape closes the dialog only. It never refuses on the visitor's behalf.
    if (event.key === 'Escape') {
      event.stopPropagation()
      setDialogOpen(false)
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const privacy = config.privacyPolicyUrl ? (
    <>
      {' '}
      <a href={config.privacyPolicyUrl} className="engage-consent__link">
        Privacy policy
      </a>
    </>
  ) : null

  return (
    <div className="engage-consent-root" data-theme={config.theme === 'auto' ? undefined : config.theme} style={colourVariables(config)}>
      {!decided ? (
        <section className={`engage-consent engage-consent--${config.position}`} role="region" aria-label={config.bannerTitle}>
          <div className="engage-consent__text">
            <p className="engage-consent__title">{config.bannerTitle}</p>
            <p className="engage-consent__body">
              {config.bannerText}
              {privacy}
            </p>
          </div>
          <div className="engage-consent__actions">
            <button type="button" className="engage-consent__button" onClick={() => decide(allChoices(false))}>
              {config.rejectLabel}
            </button>
            <button type="button" className="engage-consent__button" onClick={openSettings}>
              {config.customiseLabel}
            </button>
            <button type="button" className="engage-consent__button engage-consent__button--primary" onClick={() => decide(allChoices(true))}>
              {config.acceptLabel}
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className="engage-consent__settings" data-cookie-settings>
          {config.cookieSettingsLabel}
        </button>
      )}

      {dialogOpen ? (
        <div className="engage-consent__overlay">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="engage-consent-title"
            className="engage-consent__dialog"
            onKeyDown={onDialogKeyDown}
          >
            <h2 id="engage-consent-title" className="engage-consent__heading">
              {config.cookieSettingsLabel}
            </h2>
            <p className="engage-consent__body">
              {config.bannerText}
              {privacy}
            </p>
            <ul className="engage-consent__categories">
              {CONSENT_CATEGORIES.map((category) => (
                <CategoryRow
                  key={category}
                  category={category}
                  checked={draft[category]}
                  cookies={config.cookieList.filter((cookie) => cookie.category === category)}
                  onToggle={(granted) => setDraft((current) => withCategory(current, category, granted))}
                />
              ))}
            </ul>
            <div className="engage-consent__actions">
              <button type="button" className="engage-consent__button" onClick={() => decide(allChoices(false))}>
                {config.rejectLabel}
              </button>
              <button type="button" className="engage-consent__button" onClick={() => decide(draft)}>
                {config.saveLabel}
              </button>
              <button type="button" className="engage-consent__button engage-consent__button--primary" onClick={() => decide(allChoices(true))}>
                {config.acceptLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type CategoryRowProps = {
  category: CookieCategory
  checked: boolean
  cookies: ConsentConfig['cookieList']
  onToggle: (granted: boolean) => void
}

const CategoryRow = ({ category, checked, cookies, onToggle }: CategoryRowProps) => {
  const copy = CATEGORY_COPY[category]
  const id = `engage-consent-${category}`
  const necessary = category === 'necessary'
  return (
    <li className="engage-consent__category">
      <label htmlFor={id} className="engage-consent__category-label">
        <span>{copy.label}</span>
        <input
          id={id}
          type="checkbox"
          checked={necessary ? true : checked}
          disabled={necessary}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </label>
      <p className="engage-consent__category-text">{necessary ? `${copy.description} Always on.` : copy.description}</p>
      {cookies.length > 0 ? (
        <ul className="engage-consent__cookies">
          {cookies.map((cookie) => (
            <li key={`${cookie.name}-${cookie.provider}`}>
              <strong>{cookie.name}</strong>
              {cookie.provider ? ` (${cookie.provider})` : ''}
              {cookie.duration ? ` - ${cookie.duration}` : ''}
              {cookie.purpose ? `: ${cookie.purpose}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
