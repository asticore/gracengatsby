import { GoogleConnection } from '@/globals/GoogleConnection'

import { createGlobalOps } from '../generic'
import { googleConnection } from '../schema'

/**
 * The `google-connection` global (src/globals/GoogleConnection.ts). Secret
 * fields are returned encrypted by this layer; the engine's field hooks decrypt
 * them on a normal read. Use src/features/google/auth.ts rather than this file.
 */
export type GoogleConnectionDoc = {
  id: number
  clientId?: string | null
  clientSecretEnc?: string | null
  refreshTokenEnc?: string | null
  connectedEmail?: string | null
  connectedAt?: string | null
  scopesGranted?: string | null
  ga4PropertyId?: string | null
  ga4MeasurementId?: string | null
  searchConsoleSite?: string | null
  gtmAccountId?: string | null
  gtmContainerId?: string | null
  adsenseAccountId?: string | null
  adsensePublisherId?: string | null
  lastError?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(googleConnection, GoogleConnection, {}, {})

export const findGoogleConnection = ops.find as unknown as () => Promise<GoogleConnectionDoc | null>
export const updateGoogleConnection = ops.update as unknown as (
  data: Partial<Omit<GoogleConnectionDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<GoogleConnectionDoc>
