import type { Sort, Where } from '@/engine'

import { Events } from '@/collections/Events'

import { createCollectionOps, createDraftOps, createVersionsOps } from '../generic'
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

const baseOps = createCollectionOps(events, Events, {}, { groupFields: eventsGenerated.groupFields, joinFields: eventsJoinFields })
const versionsOps = createVersionsOps(eventsVersions, eventsGenerated.groupFields)
// Events has drafts enabled (versions.drafts: true) - every write also goes
// through the draft/publish policy createDraftOps composes on top of
// baseOps/versionsOps. See createDraftOps' doc comment for the confirmed
// behaviour and tests/int/cms-db-events-drafts.int.spec.ts for the parity
// proof. `rsvps` is omitted from what gets snapshotted into a version row -
// it's a join field, never a real column on either table (see
// createJoinOps' doc comment).
const ops = createDraftOps(baseOps, versionsOps, { omit: ['rsvps'] })

export const findEvents = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<EventDoc[]>
export const findEventByID = ops.findByID as unknown as (id: number, opts?: { draft?: boolean }) => Promise<EventDoc | null>
export const countEvents = ops.count
export const createEvent = ops.create as unknown as (
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string; startDate: string },
) => Promise<EventDoc>
export const updateEvent = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { draft?: boolean },
) => Promise<EventDoc | null>
export const deleteEvent = ops.deleteByID

export const findLatestEventVersion = versionsOps.findLatestByParentID as unknown as (parentId: number) => Promise<EventVersion | null>
export const findEventVersions = versionsOps.findAllByParentID as unknown as (parentId: number) => Promise<EventVersion[]>
export const createEventVersion = versionsOps.createVersion as unknown as (
  parentId: number,
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { latest?: boolean },
) => Promise<EventVersion>

// Plain baseOps exports for engageD1Adapter's dispatch - deliberately NOT the
// createDraftOps-wrapped ops above. Payload's own create()/update() call
// payload.db.create/payload.db.updateOne (this adapter's intercepted
// methods) and THEN, separately and unconditionally when the collection has
// `versions` set, call saveVersion() -> payload.db.createVersion (an adapter
// method this dispatch does NOT intercept, so it falls through to the real
// base adapter and writes _eg_events_v itself) - confirmed by reading
// payload/dist/collections/operations/create.js:194-221 directly. createEvent/
// updateEvent above (createDraftOps-wrapped) ALREADY write their own version
// row internally (see generic.ts's createDraftOps doc comment) - wiring the
// adapter dispatch to those instead of the plain baseOps below would
// double-write a version row on every real create/publish-update.
// adapter.find/findOne use findEventsPaginated below for the same reason -
// Payload's real find/findOne never branch on draft themselves (they always
// read the live row; draft:true is handled by a separate, unintercepted
// payload.db.findVersions call) - but adapter.count and adapter.deleteOne
// reuse the existing countEvents/deleteEvent above unchanged: createDraftOps
// only overrides create/updateByID/findByID (see generic.ts), so those two
// already equal baseOps.count/baseOps.deleteByID.
export const findEventsPaginated = baseOps.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof baseOps.findPaginated>
export const createEventLiveRow = baseOps.create as unknown as (
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string; startDate: string },
) => Promise<EventDoc>
export const updateEventLiveRow = baseOps.updateByID as unknown as (
  id: number,
  data: Partial<Omit<EventDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EventDoc | null>
