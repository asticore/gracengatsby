/**
 * Google Consent Mode v2 signals.
 *
 * The signals describe the visitor's choice to Google's tags, so they have to
 * be in place before any Google tag loads: a `default` command with the
 * starting state, then an `update` whenever the choice changes. The default
 * carries wait_for_update so tags hold back briefly for an update that is
 * already on its way.
 *
 * Only the snippet strings and argument objects are built here. The browser
 * side (AnalyticsLoader) runs them.
 */

import { type ConsentChoices } from './consent'

export const CONSENT_MODE_KEYS = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
  'functionality_storage',
  'personalization_storage',
  'security_storage',
] as const

export type ConsentModeKey = (typeof CONSENT_MODE_KEYS)[number]
export type ConsentModeSignal = 'granted' | 'denied'
export type ConsentModeSignals = Record<ConsentModeKey, ConsentModeSignal>

/** How each category maps onto Google's storage types. Security is always granted. */
export function consentModeSignals(choices: ConsentChoices): ConsentModeSignals {
  const signal = (on: boolean): ConsentModeSignal => (on ? 'granted' : 'denied')
  return {
    ad_storage: signal(choices.marketing),
    ad_user_data: signal(choices.marketing),
    ad_personalization: signal(choices.marketing),
    analytics_storage: signal(choices.analytics),
    functionality_storage: signal(choices.preferences),
    personalization_storage: signal(choices.preferences),
    security_storage: 'granted',
  }
}

export const CONSENT_DEFAULT_WAIT_MS = 500

/** The arguments of gtag('consent', 'default', ...). */
export function consentDefaultArgs(choices: ConsentChoices): ['consent', 'default', ConsentModeSignals & { wait_for_update: number }] {
  return ['consent', 'default', { ...consentModeSignals(choices), wait_for_update: CONSENT_DEFAULT_WAIT_MS }]
}

/** The arguments of gtag('consent', 'update', ...). */
export function consentUpdateArgs(choices: ConsentChoices): ['consent', 'update', ConsentModeSignals] {
  return ['consent', 'update', consentModeSignals(choices)]
}

const GTAG_BOOTSTRAP = 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}'

/** Inline script text for the default command. Runs before any tag is added. */
export function consentDefaultSnippet(choices: ConsentChoices): string {
  return `${GTAG_BOOTSTRAP}gtag(${consentDefaultArgs(choices).map((arg) => JSON.stringify(arg)).join(',')});`
}

/** Inline script text for an update. */
export function consentUpdateSnippet(choices: ConsentChoices): string {
  return `${GTAG_BOOTSTRAP}gtag(${consentUpdateArgs(choices).map((arg) => JSON.stringify(arg)).join(',')});`
}
