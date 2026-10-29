'use client'

import { useEffect } from 'react'

import type { PublicTrackingEvent } from './publicEvent'
import { startTracking, trackingSuppressed, type TrackingRuntimeOptions } from './runtime'
import type { TrackingPlatform } from './events'

export type TrackingRuntimeProps = Omit<TrackingRuntimeOptions, 'events'> & {
  events: PublicTrackingEvent[]
  /** True for a signed-in admin: their own visits are not tracked. */
  suppressed?: boolean
  /** The admin path (e.g. /admin or a custom one). Tracking never runs under it. */
  adminPath?: string
}

/**
 * Renders nothing. Mounted only when there is at least one enabled event and
 * one connected platform. Tracking is suppressed on preview and admin paths.
 */
export function TrackingRuntime({ events, platforms, policyVersion, optIn, adminPath = '/admin', suppressed = false }: TrackingRuntimeProps): null {
  useEffect(() => {
    if (suppressed || !events.length || !platforms.length) return
    if (trackingSuppressed(window.location.pathname, adminPath)) return
    return startTracking(window as unknown as Window & Record<string, unknown>, { events, platforms: platforms as TrackingPlatform[], policyVersion, optIn })
  }, [events, platforms, policyVersion, optIn, adminPath, suppressed])
  return null
}
