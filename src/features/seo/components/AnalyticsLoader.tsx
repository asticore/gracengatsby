'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { effectiveChoices, type ConsentChoices } from '@/features/consent/consent'
import { consentDefaultSnippet, consentUpdateSnippet } from '@/features/consent/googleConsentMode'
import { getConsentState, SERVER_CONSENT_STATE, subscribeConsent, type ConsentState } from '@/features/consent/store'

export type AnalyticsIds = {
  gtmContainerId?: string
  ga4MeasurementId?: string
  metaPixelId?: string
  clarityProjectId?: string
}

export type AnalyticsLoaderProps = AnalyticsIds & {
  /** Visitor must choose before optional tags load (see requireOptIn). */
  optIn: boolean
  policyVersion: number
  consentModeV2: boolean
}

const appendScript = (attributes: Record<string, string>, inline?: string) => {
  const script = document.createElement('script')
  Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value))
  if (inline) script.text = inline
  document.head.appendChild(script)
}

/*
 * Tag state for this page load. Tags cannot be unloaded, so once one is in
 * the document it stays for the rest of the visit.
 *
 * With Consent Mode v2 on, a refusal after load changes the consent signals
 * Google receives, and new tags stop loading on the next page view.
 *
 * With Consent Mode v2 off there are no signals to change, so a tag that has
 * already loaded keeps running until the page reloads. ConsentManager reloads
 * the page when analytics or marketing is withdrawn, so a refusal takes effect
 * straight away; the reload is what makes withdrawal after load real.
 */
const tagState = {
  consentDefaultPushed: false,
  lastSignalKey: '',
  gtm: false,
  analytics: false,
  marketing: false,
}

const loadGtm = (gtmContainerId?: string) => {
  if (tagState.gtm || !gtmContainerId) return
  tagState.gtm = true
  const w = window as unknown as Record<string, unknown>
  w.dataLayer = (w.dataLayer as unknown[]) || []
  ;(w.dataLayer as unknown[]).push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  appendScript({
    async: 'true',
    src: `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmContainerId)}`,
  })
}

const loadAnalyticsTags = ({ ga4MeasurementId, clarityProjectId }: AnalyticsIds) => {
  if (tagState.analytics) return
  tagState.analytics = true

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

  if (clarityProjectId) {
    appendScript(
      {},
      `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
        `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
        `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);` +
        `})(window, document, "clarity", "script", ${JSON.stringify(clarityProjectId)});`,
    )
  }
}

const loadMarketingTags = ({ metaPixelId }: AnalyticsIds) => {
  if (tagState.marketing || !metaPixelId) return
  tagState.marketing = true
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

/**
 * Brings the page's tags in line with the visitor's choices.
 *
 * Consent Mode goes first: the default (or, on a later change, an update) is
 * pushed before any Google tag is added, so no tag can see a stale state. The
 * tags for a category load only once that category is granted.
 */
export function syncAnalyticsTags(ids: AnalyticsIds, consentModeV2: boolean, choices: ConsentChoices): void {
  const hasTags = Boolean(ids.gtmContainerId || ids.ga4MeasurementId || ids.metaPixelId || ids.clarityProjectId)
  if (!hasTags) return

  const signalKey = JSON.stringify(choices)
  if (consentModeV2) {
    if (!tagState.consentDefaultPushed) {
      tagState.consentDefaultPushed = true
      appendScript({}, consentDefaultSnippet(choices))
    } else if (signalKey !== tagState.lastSignalKey) {
      appendScript({}, consentUpdateSnippet(choices))
    }
  }
  tagState.lastSignalKey = signalKey

  // Without Consent Mode, GTM also carries marketing tags, so it waits for both
  // categories. With Consent Mode, Google's signals cover a refusal and GTM
  // loads on analytics alone, as before.
  const gtmGranted = consentModeV2 ? choices.analytics : choices.analytics && choices.marketing
  if (gtmGranted) loadGtm(ids.gtmContainerId)
  if (choices.analytics) loadAnalyticsTags(ids)
  if (choices.marketing) loadMarketingTags(ids)
}

/**
 * Renders nothing. Exists to run the tag loader in the browser, where the
 * consent decision is known; the server never renders a tag.
 *
 * Doing it client-side is what makes the consent gate real: with opt-in on,
 * no third-party request is made until the visitor has said yes.
 */
export const AnalyticsLoader = ({ optIn, policyVersion, consentModeV2, ...ids }: AnalyticsLoaderProps): null => {
  const consent = useSyncExternalStore(subscribeConsent, getConsentState, (): ConsentState => SERVER_CONSENT_STATE)
  const choices = effectiveChoices(consent.record, policyVersion, !optIn)
  const signalKey = JSON.stringify(choices)

  useEffect(() => {
    syncAnalyticsTags(ids, consentModeV2, JSON.parse(signalKey) as ConsentChoices)
    // The ids are primitives; the choice is passed as its key, so this runs once per real change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalKey, consentModeV2, ids.gtmContainerId, ids.ga4MeasurementId, ids.metaPixelId, ids.clarityProjectId])

  return null
}
