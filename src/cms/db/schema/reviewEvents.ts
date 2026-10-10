import { ReviewEvents } from '@/features/approval/collection'

import { generateTable } from './generate'

/**
 * Table for the `review-events` collection, kept in its own file like ./redirects.ts so the very
 * large schema index is not edited for a feature. The collection module imports it from here.
 */
const reviewEventsGenerated = generateTable(ReviewEvents)
export const reviewEvents = reviewEventsGenerated.table
