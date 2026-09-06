import type { Where } from '@/engine'

import { Events } from '@/collections/Events'

import { createCollectionOps, createVersionsOps } from '../generic'
import { events, eventsGenerated, eventsJoinFields, eventsVersions } from '../schema'

/** Payload's document shape for the `events` collection - see src/collections/Events.ts. `rsvps` is a `join` field, resolved read-only at query time - see ../generic.ts's createJoinOps doc comment for the confirmed `{ docs, hasNextPage }` shape. */
export type EventDoc = {
  id: number
  title: string
  slug?: string | null
  summary?: string | null
  description?: unknown
  coverImage?: number | null
  startDate: string
  endDate?: string | null
  location?: { venueName?: string | null; address?: string | null; isOnline?: boolean | null }
  eventType: string
  ticketProduct?: number | null
  capacity?: number | null
  externalRegistrationUrl?: string | null
  customFields?: unknown
  rsvps?: { docs: number[]; hasNextPage: boolean }
  _status?: string | null
  updatedAt: string
  createdAt: string
}

/** One saved version of an Events document - top-level scalar/group fields only, see generateVersionsTable's doc comment for what's not modeled yet (versioned blocks/arrays/rels). */
export type EventVersion = {
  id: number
  parentId: number | null
  latest: boolean | null
  createdAt: string
  updatedAt: string
  versionUpdatedAt: string | null
  versionCreatedAt: string | null
  _status?: string | null
} & Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt' | '_status'>

const ops = createCollectionOps(events, Events, {}, { groupFields: eventsGenerated.groupFields, joinFields: eventsJoinFields })
const versionsOps = createVersionsOps(eventsVersions, eventsGenerated.groupFields)

export const findEvents = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<EventDoc[]>
export const findEventByID = ops.findByID as unknown as (id: number) => Promise<EventDoc | null>
export const countEvents = ops.count
export const createEvent = ops.create as unknown as (
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string; startDate: string },
) => Promise<EventDoc>
export const updateEvent = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EventDoc | null>
export const deleteEvent = ops.deleteByID

export const findLatestEventVersion = versionsOps.findLatestByParentID as unknown as (parentId: number) => Promise<EventVersion | null>
export const findEventVersions = versionsOps.findAllByParentID as unknown as (parentId: number) => Promise<EventVersion[]>
export const createEventVersion = versionsOps.createVersion as unknown as (
  parentId: number,
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { latest?: boolean },
) => Promise<EventVersion>
