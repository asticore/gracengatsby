import { TrackingEvents } from '@/features/tracking/collections/TrackingEvents'

import { generateTable } from './generate'

/** Table for the tracking events collection, in its own file so the schema index is not edited. */
const eventsGenerated = generateTable(TrackingEvents)
export const trackingEvents = eventsGenerated.table
