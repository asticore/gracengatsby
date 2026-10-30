import type { ConnectProvider } from '../constants'
import { metaClient } from './meta'
import { tiktokClient } from './tiktok'
import type { TrackingProviderClient } from './types'

export { ProviderError, type PixelOption, type ProviderFailure, type ProviderTokens, type TrackingProviderClient } from './types'

/** The client for one ad platform. The routes and the service never import the vendor files directly. */
export function clientFor(provider: ConnectProvider): TrackingProviderClient {
  return provider === 'meta' ? metaClient : tiktokClient
}
