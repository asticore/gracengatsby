import type { ConnectProvider } from '../constants'
import type { Fetcher } from '../http'

/** Why a provider call failed. The screen maps each reason to a translated sentence; no provider text is shown. */
export type ProviderFailure = 'refused' | 'network' | 'bad-response' | 'no-access'

export class ProviderError extends Error {
  constructor(public readonly reason: ProviderFailure) {
    super(reason)
    this.name = 'ProviderError'
  }
}

/** What a finished sign-in gives back. Tokens never leave the server. */
export type ProviderTokens = {
  accessToken: string
  /** Seconds until the token stops working, or null when the provider does not say. */
  expiresInSeconds: number | null
  /** Plain-text name of the account that signed in, for "Connected as ...". */
  accountName: string
}

export type PixelOption = { value: string; label: string }

/**
 * One ad platform behind a single interface. The real implementations call the
 * provider's API; tests pass a fake fetch. Nothing here logs a token or a secret.
 */
export interface TrackingProviderClient {
  readonly id: ConnectProvider
  /** Whether the provider's authorize step accepts a PKCE challenge. Set only when it is documented. */
  readonly pkce: boolean
  /** The query parameter the provider puts the one-time code in on return. */
  readonly codeParam: 'code' | 'auth_code'
  authorizeUrl(args: { appId: string; redirectUri: string; state: string; codeChallenge?: string }): string
  exchangeCode(args: {
    appId: string
    appSecret: string
    code: string
    redirectUri: string
    codeVerifier?: string
    fetchImpl: Fetcher
  }): Promise<ProviderTokens>
  /** The pixels the signed-in account can use, as picker options. Value is what gets stored as the pixel ID. */
  listPixels(args: { appId: string; accessToken: string; fetchImpl: Fetcher }): Promise<PixelOption[]>
  /** Best-effort revoke at the provider. Resolves false when the provider has no revoke call. */
  revoke(args: { appId: string; appSecret: string; accessToken: string; fetchImpl: Fetcher }): Promise<boolean>
}
