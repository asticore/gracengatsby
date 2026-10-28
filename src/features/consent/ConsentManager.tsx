'use client'

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

import {
  allChoices,
  CONSENT_CATEGORIES,
  effectiveChoices,
  isCurrentRecord,
  withCategory,
  type ConsentChoices,
  type CookieCategory,
} from './consent'
import { DEFAULT_CONSENT_TEXT, readableTextOn, type ConsentConfig } from './config'
import { useStoreText } from '@/features/uiStrings/StoreTextsContext'
import type { UiStringKey } from '@/features/uiStrings/keys'
import { activateGatedMarkup } from './gate'
import { configureConsent, type ConsentState, getConsentState, saveConsent, SERVER_CONSENT_STATE, subscribeConsent } from './store'

import './consent.css'

/** Fired on window to open the Customise dialog from any script. */
type ConsentTextKey = keyof typeof DEFAULT_CONSENT_TEXT

const CONSENT_TEXT_KEYS: Record<ConsentTextKey, UiStringKey> = {
  bannerTitle: 'store.cookieBannerTitle',
  bannerText: 'store.cookieBannerText',
  acceptLabel: 'store.acceptAll',
  rejectLabel: 'store.rejectAll',
  customiseLabel: 'store.customise',
  saveLabel: 'store.saveChoices',
  cookieSettingsLabel: 'store.cookieSettings',
  privacyPolicyLabel: 'store.privacyPolicy',
}

/** Owner-set wording wins verbatim. Empty or the built-in English default falls back to the store translation. */
const consentCopy = (config: ConsentConfig, t: (key: UiStringKey) => string): Record<ConsentTextKey, string> => {
  const out = {} as Record<ConsentTextKey, string>
  for (const key of Object.keys(CONSENT_TEXT_KEYS) as ConsentTextKey[]) {
    const value = config[key]
    out[key] = value && value !== DEFAULT_CONSENT_TEXT[key] ? value : t(CONSENT_TEXT_KEYS[key])
  }
  return out
}

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
  /**
   * Admin preview. Renders the same banner and dialog, but inside the nearest
   * positioned frame instead of over the page, and touches nothing outside
   * itself: no cookie, no localStorage, no consent log, no tag or embed
   * activation, no page reload, no focus stealing.
   */
  previewMode?: boolean
  /** Preview only: what to show. 'link' is the small "Cookie settings" button shown after a choice. */
  previewView?: 'banner' | 'dialog' | 'link'
  /** Preview only: light or dark, used when the settings follow the site theme. */
  previewTheme?: 'light' | 'dark'
  /** Preview only: apply the small-screen layout (the frame is narrower than the window). */
  previewNarrow?: boolean
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Every value here has been through normaliseConsentConfig (hex colours only,
 * clamped numbers), so nothing from the settings reaches a style attribute raw.
 */
export const consentStyleVariables = (config: ConsentConfig): CSSProperties => {
  const vars: Record<string, string> = {}
  if (config.bannerBackground) vars['--engage-consent-bg'] = config.bannerBackground
  if (config.bannerTextColor) vars['--engage-consent-fg'] = config.bannerTextColor
  if (config.buttonColor) {
    vars['--engage-consent-btn'] = config.buttonColor
    const on = readableTextOn(config.buttonColor)
    if (on) vars['--engage-consent-btn-fg'] = on
  }
  if (config.accentColor) vars['--engage-consent-accent'] = config.accentColor
  if (config.borderRadius !== null) vars['--engage-consent-radius'] = `${config.borderRadius}px`
  if (config.fontSize !== null) vars['--engage-consent-size'] = `${config.fontSize}px`
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
export const ConsentManager = ({ config, optIn, initialDecided, previewMode, previewView = 'banner', previewTheme = 'light', previewNarrow }: ConsentManagerProps) => {
  const storeText = useStoreText()
  const copy = consentCopy(config, storeText)
  const preview = previewMode === true
  const consent = useSyncExternalStore(subscribeConsent, getConsentState, (): ConsentState => SERVER_CONSENT_STATE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<ConsentChoices>(() => (previewMode === true ? effectiveChoices(null, config.policyVersion, !optIn) : allChoices(false)))
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const { policyVersion, logConsent } = config
  const decided = preview ? previewView === 'link' : consent.loaded ? isCurrentRecord(consent.record, policyVersion) : initialDecided
  const choices = effectiveChoices(preview ? null : consent.record, policyVersion, !optIn)
  const choicesKey = JSON.stringify(choices)

  useEffect(() => {
    if (preview) return
    configureConsent({ policyVersion, defaultGranted: !optIn, logConsent })
  }, [preview, policyVersion, optIn, logConsent])

  useEffect(() => {
    if (preview) return
    activateGatedMarkup(document, JSON.parse(choicesKey) as ConsentChoices)
  }, [preview, choicesKey])

  const openSettings = useCallback(() => {
    if (!preview) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDraft(effectiveChoices(preview ? null : getConsentState().record, policyVersion, !optIn))
    setDialogOpen(true)
  }, [preview, policyVersion, optIn])

  // The dialog's checkboxes start from the visitor's region (opt-out regions start ticked).
  // In the preview the draft resets whenever its inputs change. This runs during render, not in an effect.
  const draftInputs = `${preview}|${policyVersion}|${optIn}`
  const [syncedDraftInputs, setSyncedDraftInputs] = useState(draftInputs)
  if (syncedDraftInputs !== draftInputs) {
    setSyncedDraftInputs(draftInputs)
    if (preview) setDraft(effectiveChoices(null, policyVersion, !optIn))
  }

  useEffect(() => {
    if (preview) return
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
  }, [preview, openSettings])

  // Focus moves into the dialog when it opens and back to its opener when it closes.
  useEffect(() => {
    if (preview) return
    if (dialogOpen) {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
      return
    }
    openerRef.current?.focus()
    openerRef.current = null
  }, [preview, dialogOpen])

  // In the preview a view change resets the dialog, so each view starts clean. This runs during render, not in an effect.
  const viewKey = `${preview}|${previewView}`
  const [syncedViewKey, setSyncedViewKey] = useState(viewKey)
  if (syncedViewKey !== viewKey) {
    setSyncedViewKey(viewKey)
    if (preview) setDialogOpen(false)
  }

  if (!config.enabled && !preview) return null

  const dialogShown = preview ? previewView === 'dialog' || dialogOpen : dialogOpen

  const decide = (next: ConsentChoices) => {
    if (preview) {
      setDialogOpen(false)
      return
    }
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
    if (preview || event.key !== 'Tab' || !dialogRef.current) return
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
      <a
        href={config.privacyPolicyUrl}
        className="engage-consent__link"
        {...(preview ? { onClick: (event: React.MouseEvent) => event.preventDefault() } : {})}
      >
        {copy.privacyPolicyLabel}
      </a>
    </>
  ) : null

  return (
    <div
      className={`engage-consent-root${preview ? ' engage-consent-root--preview' : ''}${preview && previewNarrow ? ' engage-consent-root--narrow' : ''}`}
      data-theme={config.theme === 'auto' ? (preview ? previewTheme : undefined) : config.theme}
      style={consentStyleVariables(config)}
    >
      {!decided ? (
        <section className={`engage-consent engage-consent--${config.position}`} role="region" aria-label={copy.bannerTitle}>
          {config.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="engage-consent__logo" src={config.logoUrl} alt="" width={40} height={40} />
          ) : null}
          <div className="engage-consent__text">
            <p className="engage-consent__title">{copy.bannerTitle}</p>
            <p className="engage-consent__body">
              {copy.bannerText}
              {privacy}
            </p>
          </div>
          <div className="engage-consent__actions">
            {config.showRejectButton ? (
              <button type="button" className="engage-consent__button" onClick={() => decide(allChoices(false))}>
                {copy.rejectLabel}
              </button>
            ) : null}
            <button type="button" className="engage-consent__button" onClick={openSettings}>
              {copy.customiseLabel}
            </button>
            <button type="button" className="engage-consent__button engage-consent__button--primary" onClick={() => decide(allChoices(true))}>
              {copy.acceptLabel}
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="engage-consent__settings"
          {...(preview ? { onClick: openSettings } : { 'data-cookie-settings': true })}
        >
          {copy.cookieSettingsLabel}
        </button>
      )}

      {dialogShown ? (
        <div className="engage-consent__overlay">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal={preview ? undefined : true}
            aria-labelledby="engage-consent-title"
            className="engage-consent__dialog"
            onKeyDown={onDialogKeyDown}
          >
            <h2 id="engage-consent-title" className="engage-consent__heading">
              {copy.cookieSettingsLabel}
            </h2>
            <p className="engage-consent__body">
              {copy.bannerText}
              {privacy}
            </p>
            <ul className="engage-consent__categories">
              {CONSENT_CATEGORIES.map((category) => (
                <CategoryRow
                  key={category}
                  category={category}
                  copy={config.categoryCopy[category]}
                  checked={draft[category]}
                  cookies={config.cookieList.filter((cookie) => cookie.category === category)}
                  onToggle={(granted) => setDraft((current) => withCategory(current, category, granted))}
                />
              ))}
            </ul>
            <div className="engage-consent__actions">
              {config.showRejectButton ? (
                <button type="button" className="engage-consent__button" onClick={() => decide(allChoices(false))}>
                  {copy.rejectLabel}
                </button>
              ) : null}
              <button type="button" className="engage-consent__button" onClick={() => decide(draft)}>
                {copy.saveLabel}
              </button>
              <button type="button" className="engage-consent__button engage-consent__button--primary" onClick={() => decide(allChoices(true))}>
                {copy.acceptLabel}
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
  copy: { label: string; description: string }
  checked: boolean
  cookies: ConsentConfig['cookieList']
  onToggle: (granted: boolean) => void
}

const CategoryRow = ({ category, copy, checked, cookies, onToggle }: CategoryRowProps) => {
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
      <p className="engage-consent__category-text">{necessary && !/always on/i.test(copy.description) ? `${copy.description} Always on.` : copy.description}</p>
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
