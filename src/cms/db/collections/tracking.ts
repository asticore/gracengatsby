import { TrackingEvents } from '@/features/tracking/collections/TrackingEvents'

import { createCollectionOps } from '../generic'
import { trackingEvents } from '../schema/tracking'

type Doc = Record<string, unknown> & { id: number; updatedAt: string; createdAt: string }
type Paged = (args?: { where?: import('@/engine').Where; sort?: import('@/engine').Sort; limit?: number; page?: number; pagination?: boolean }) => Promise<any>

const eventOps = createCollectionOps(trackingEvents, TrackingEvents)
export const findTrackingEventsPaginated = eventOps.findPaginated as unknown as Paged
export const findTrackingEventByID = eventOps.findByID as unknown as (id: number) => Promise<Doc | null>
export const countTrackingEvents = eventOps.count
export const createTrackingEvent = eventOps.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateTrackingEvent = eventOps.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteTrackingEvent = eventOps.deleteByID
