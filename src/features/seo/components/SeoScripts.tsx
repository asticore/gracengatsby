import React from 'react'
import { cookies } from 'next/headers'

import { pickPublicIds } from '@/features/integrations/publicIds'
import { CONSENT_COOKIE_NAME, isCurrentRecord, parseRecord } from '@/features/consent/consent'
import { normaliseConsentConfig, scriptGate, type ConsentConfig } from '@/features/consent/config'
import { GatedScript } from '@/features/consent/GatedScript'
import { ConsentManager } from '@/features/consent/ConsentManager'
import { requireOptIn } from '@/features/consent/regions'

import { getSeoContext } from '../settings'
import { AnalyticsLoader } from './AnalyticsLoader'

export type SeoScriptsProps = {
  /**
   * `head` renders the consent banner, the analytics loader and the custom head
   * snippets; place it as the first child of <body>. `bodyEnd` renders only the
   * body-end snippets; place it as the last child.
   */
  position?: 'head' | 'bodyEnd'
  /** Two-letter country from Cloudflare's cf-ipcountry, read in the root layout. */
  country?: string | null
}

const loadIntegrations = async (): Promise<Record<string, unknown> | null> => {
  try {
    const { getEngine } = await import('@/lib/engine')
    const engine = await getEngine()
    return (await engine
      .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
      .catch((): null => null)) as Record<string, unknown> | null
  } catch {
    // No integrations row yet (fresh install): the defaults apply.
    return null
  }
}

const decodeCookie = (raw: string | undefined): string | null => {
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/**
 * What the server can tell about the visitor's choice. The server can see the
 * cookie, so a returning visitor's banner is not rendered first and then
 * removed; the browser still makes the real decision.
 */
const readConsentState = async (consent: ConsentConfig, country: string | null) => {
  const cookieStore = await cookies()
  const stored = parseRecord(decodeCookie(cookieStore.get(CONSENT_COOKIE_NAME)?.value))
  return {
    initialDecided: isCurrentRecord(stored, consent.policyVersion),
    optIn: consent.enabled && requireOptIn(country, consent.mode),
  }
}

/** The consent banner alone, for when the SEO feature is off. */
const ConsentOnly = async ({ consent, country }: { consent: ConsentConfig; country: string | null }) => {
  const { initialDecided, optIn } = await readConsentState(consent, country)
  return <ConsentManager config={consent} optIn={optIn} initialDecided={initialDecided} />
}

/**
 * Analytics, consent and custom code.
 *
 * Custom code is written into the server-rendered HTML but gated: it sits in
 * inert markup until its category is granted (see GatedScript). Analytics is
 * injected by the browser after the decision is known (see AnalyticsLoader),
 * so when opt-in applies no third-party request is made before a yes.
 */
export const SeoScripts = async ({ position = 'head', country = null }: SeoScriptsProps): Promise<React.ReactElement | null> => {
  const context = await getSeoContext()
  const seoOn = context.enabled && Boolean(context.settings)

  const integrations = await loadIntegrations()
  const analytics = seoOn ? (context.settings?.analytics as Record<string, unknown> | undefined) : undefined
  const consent = normaliseConsentConfig(integrations, analytics)

  // Consent is independent of SEO. With SEO off, the banner still shows when
  // consent is on; custom code and analytics tags come from SEO settings, so
  // they stay off as before.
  if (!seoOn) {
    if (position === 'bodyEnd' || !consent.enabled) return null
    return <ConsentOnly consent={consent} country={country} />
  }

  const custom = context.settings?.customCode

  if (position === 'bodyEnd') {
    const html = custom?.bodyEndScripts?.trim()
    return html ? <GatedScript html={html} category={scriptGate(consent, 'body')} label="body-end" /> : null
  }

  const headHtml = custom?.headScripts?.trim()

  // Public IDs: Integrations first, falling back field by field to the old
  // SEO & Analytics values (see pickPublicIds).
  const { gtmContainerId, ga4MeasurementId, metaPixelId, clarityProjectId } = pickPublicIds(integrations, { analytics })

  const { initialDecided, optIn } = await readConsentState(consent, country)

  return (
    <>
      {headHtml ? <GatedScript html={headHtml} category={scriptGate(consent, 'head')} label="head" /> : null}
      <ConsentManager config={consent} optIn={optIn} initialDecided={initialDecided} />
      <AnalyticsLoader
        gtmContainerId={gtmContainerId}
        ga4MeasurementId={ga4MeasurementId}
        metaPixelId={metaPixelId}
        clarityProjectId={clarityProjectId}
        optIn={optIn}
        policyVersion={consent.policyVersion}
        consentModeV2={consent.consentModeV2}
      />
    </>
  )
}

/** Convenience wrapper for the last child of <body>. */
export const SeoBodyScripts = async (): Promise<React.ReactElement | null> => SeoScripts({ position: 'bodyEnd' })
