import { EventRSVPs } from '@/collections/EventRSVPs'
import { Faqs } from '@/collections/Faqs'
import { MembershipTiers } from '@/features/members/collections/MembershipTiers'

import { generateArrayTable, generateTable } from './generate'

/**
 * Tables generated straight from the real collection configs, not
 * hand-copied - see ./generate.ts. Each addition here is the next-smallest
 * step up in field-type coverage over the last:
 *
 *  - Faqs: scalar fields only (phase 1/2).
 *  - EventRSVPs: adds a single-target relationship field, still one row per
 *    document (an `event_id` FK column, not a child table).
 *  - MembershipTiers: adds row-wrapped fields (flattened onto this table,
 *    same as Payload's own schema does) and an array field (`benefits`,
 *    which needs its own child table - see membershipTiersBenefits below).
 */
const faqsGenerated = generateTable(Faqs)
export const faqs = faqsGenerated.table

const eventRSVPsGenerated = generateTable(EventRSVPs)
export const eventRSVPs = eventRSVPsGenerated.table

const membershipTiersGenerated = generateTable(MembershipTiers)
export const membershipTiers = membershipTiersGenerated.table

const [benefitsField] = membershipTiersGenerated.arrayFields
export const membershipTiersBenefits = generateArrayTable(MembershipTiers.slug, membershipTiersGenerated.tableName, benefitsField)
