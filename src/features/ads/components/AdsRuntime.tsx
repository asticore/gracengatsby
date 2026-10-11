'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { effectiveChoices, type ConsentChoices } from '@/features/consent/consent'
import { getConsentState, SERVER_CONSENT_STATE, subscribeConsent, type ConsentState } from '@/features/consent/store'

import type { PublicConfig } from '../builders'
import { startAds } from '../runtime'

/** Renders nothing. Starts ads in the browser once marketing is granted; before that nothing is loaded. */
export const AdsRuntime = ({ config, optIn, policyVersion }: { config: PublicConfig; optIn: boolean; policyVersion: number }): null => {
  const consent = useSyncExternalStore(subscribeConsent, getConsentState, (): ConsentState => SERVER_CONSENT_STATE)
  const choices = effectiveChoices(consent.record, policyVersion, !optIn)
  // One stable key for everything the effect reads: a refresh that hands over an equal config does nothing.
  const key = JSON.stringify({ choices, optIn, config })

  useEffect(() => {
    const { choices: parsed, optIn: region, config: parsedConfig } = JSON.parse(key) as { choices: ConsentChoices; optIn: boolean; config: PublicConfig }
    if (!parsed.marketing) return
    // Reveal slots that were hidden server side because consent was missing.
    document.querySelectorAll('.engage-ad[data-ad-reserve="0"]').forEach((el) => el.removeAttribute('data-ad-reserve'))
    return startAds(parsedConfig, parsed, { optInRegion: region })
  }, [key])

  return null
}
