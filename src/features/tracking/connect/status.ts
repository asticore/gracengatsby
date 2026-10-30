import type { ConnectProvider } from './constants'

/**
 * The non-secret view of the ad-platform connections. Safe to send to the
 * browser: it says whether an app and a sign-in exist, never what they are.
 */

export type ProviderStatus = {
  appId: string
  hasAppSecret: boolean
  connected: boolean
  accountName: string
  connectedAt: string
  expiresAt: string
  /** A short reason code from the last failure, such as "refused". Empty when there is none. */
  error: string
  /** The pixel ID currently set on Integrations for this platform. Public, safe to show. */
  currentPixelId: string
}

export type TrackingConnectionStatus = Record<ConnectProvider, ProviderStatus>

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Reduces the raw documents to non-secret fields. Missing values become empty strings. */
export function toTrackingConnectionStatus(
  connections: Record<string, unknown> | null | undefined,
  integrations: Record<string, unknown> | null | undefined,
): TrackingConnectionStatus {
  const pixelOf = (group: string): string => {
    const value = integrations?.[group]
    return text(value && typeof value === 'object' ? (value as Record<string, unknown>).pixelId : '')
  }
  const one = (provider: ConnectProvider, pixelGroup: string): ProviderStatus => ({
    appId: text(connections?.[`${provider}AppId`]),
    hasAppSecret: text(connections?.[`${provider}AppSecretEnc`]).length > 0,
    connected: text(connections?.[`${provider}AccessTokenEnc`]).length > 0,
    accountName: text(connections?.[`${provider}AccountName`]),
    connectedAt: text(connections?.[`${provider}ConnectedAt`]),
    expiresAt: text(connections?.[`${provider}TokenExpiresAt`]),
    error: text(connections?.[`${provider}Error`]),
    currentPixelId: pixelOf(pixelGroup),
  })
  return { meta: one('meta', 'metaPixel'), tiktok: one('tiktok', 'tiktokPixel') }
}
