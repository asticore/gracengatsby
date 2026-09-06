import { EventRSVPs } from '@/collections/EventRSVPs'
import { Faqs } from '@/collections/Faqs'

import { generateTable } from './generate'

/**
 * Tables generated straight from the real collection configs, not
 * hand-copied - see ./generate.ts. Both collections are chosen the same way
 * Faqs was in phase one: real, currently live, and the next-smallest step up
 * in field-type coverage. EventRSVPs adds one single-target relationship
 * field (`event` -> `event_id`) on top of the scalar types Faqs already
 * covers - Payload stores a non-hasMany relationship as a plain FK column on
 * the same table, not a child table, so this is still one row per document.
 */
export const faqs = generateTable(Faqs)
export const eventRSVPs = generateTable(EventRSVPs)
