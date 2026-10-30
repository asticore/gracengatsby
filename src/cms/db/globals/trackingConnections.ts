import { TrackingConnections } from '@/globals/TrackingConnections'

import { createGlobalOps } from '../generic'
import { trackingConnections } from '../schema'

/**
 * The `tracking-connections` global (src/globals/TrackingConnections.ts). Secret
 * fields come back decrypted from the engine's field hooks on a normal read.
 * Use src/features/tracking/connect/store.ts rather than this file.
 */
export type TrackingConnectionsDoc = {
  id: number
  metaAppId?: string | null
  metaAppSecretEnc?: string | null
  metaAccessTokenEnc?: string | null
  metaAccountName?: string | null
  metaConnectedAt?: string | null
  metaTokenExpiresAt?: string | null
  metaError?: string | null
  tiktokAppId?: string | null
  tiktokAppSecretEnc?: string | null
  tiktokAccessTokenEnc?: string | null
  tiktokAccountName?: string | null
  tiktokConnectedAt?: string | null
  tiktokError?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(trackingConnections, TrackingConnections, {}, {})

export const findTrackingConnections = ops.find as unknown as () => Promise<TrackingConnectionsDoc | null>
export const updateTrackingConnections = ops.update as unknown as (
  data: Partial<Omit<TrackingConnectionsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<TrackingConnectionsDoc>
