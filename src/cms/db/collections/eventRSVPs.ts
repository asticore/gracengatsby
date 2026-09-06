import type { Where } from '@/engine'

import { EventRSVPs } from '@/collections/EventRSVPs'

import { createCollectionOps } from '../generic'
import { eventRSVPs } from '../schema'

/** Payload's document shape for the `event-rsvps` collection - see src/collections/EventRSVPs.ts. */
export type EventRSVPDoc = {
  id: number
  event: number
  name: string
  email: string
  guestCount?: number | null
  notes?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(eventRSVPs, EventRSVPs)

export const findEventRSVPs = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<EventRSVPDoc[]>
export const findEventRSVPByID = ops.findByID as unknown as (id: number) => Promise<EventRSVPDoc | null>
export const countEventRSVPs = ops.count
export const createEventRSVP = ops.create as unknown as (
  data: Partial<Omit<EventRSVPDoc, 'id' | 'updatedAt' | 'createdAt'>> & { event: number; name: string; email: string },
) => Promise<EventRSVPDoc>
export const updateEventRSVP = ops.updateByID as unknown as (id: number, data: Partial<Omit<EventRSVPDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<EventRSVPDoc | null>
export const deleteEventRSVP = ops.deleteByID
