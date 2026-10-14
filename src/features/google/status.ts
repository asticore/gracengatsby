/**
 * The non-secret view of the Google connection. Safe to send to the browser:
 * it says whether a client and sign-in exist, never what they are.
 */

export type GoogleConnectionStatus = {
  clientId: string
  hasClientSecret: boolean
  connected: boolean
  connectedEmail: string
  connectedAt: string
  scopesGranted: string
  ga4PropertyId: string
  ga4MeasurementId: string
  searchConsoleSite: string
  gtmAccountId: string
  gtmContainerId: string
  adsenseAccountId: string
  adsensePublisherId: string
  lastError: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Reduces a raw global document to the non-secret fields. Missing values become empty strings. */
export function toConnectionStatus(doc: Record<string, unknown> | null | undefined): GoogleConnectionStatus {
  return {
    clientId: text(doc?.clientId),
    hasClientSecret: text(doc?.clientSecretEnc).length > 0,
    connected: text(doc?.refreshTokenEnc).length > 0,
    connectedEmail: text(doc?.connectedEmail),
    connectedAt: text(doc?.connectedAt),
    scopesGranted: text(doc?.scopesGranted),
    ga4PropertyId: text(doc?.ga4PropertyId),
    ga4MeasurementId: text(doc?.ga4MeasurementId),
    searchConsoleSite: text(doc?.searchConsoleSite),
    gtmAccountId: text(doc?.gtmAccountId),
    gtmContainerId: text(doc?.gtmContainerId),
    adsenseAccountId: text(doc?.adsenseAccountId),
    adsensePublisherId: text(doc?.adsensePublisherId),
    lastError: text(doc?.lastError),
  }
}
