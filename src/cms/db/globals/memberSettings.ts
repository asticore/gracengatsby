import { MemberSettings } from '@/globals/MemberSettings'

import { createGlobalOps } from '../generic'
import { memberSettings, memberSettingsGenerated } from '../schema'

/**
 * MemberSettings: a global made ENTIRELY of top-level `group` fields whose own
 * subfields are plain scalars (text/textarea/number/checkbox/select), several
 * wrapped in a `row` (pure layout - flattened by generate.ts's own walkFields,
 * same as every row-wrapped field elsewhere in this data layer, e.g.
 * eg_membership_tiers). No array/blocks/relationship/hasMany-select/join field
 * anywhere in this config, so - like faqSettings before its `introBlocks`
 * field was added - `generateTable()` alone is enough; the only thing beyond
 * FaqSettings' own wiring this needs is `groupFields`, since FaqSettings has
 * no group field at all (see schema/index.ts's Phase 18 doc comment) while
 * Courses already proved passing `groupFields: xGenerated.groupFields` into
 * `createGlobalOps`/`createCollectionOps` reconstructs a top-level group as a
 * nested object (Courses' `seo`) - the exact same mechanism, just four groups
 * instead of one.
 *
 * Every `admin.condition`/`admin.description`/`admin.width` on these fields is
 * confirmed UI-only: generate.ts's walkFields/processFields/columnFor never
 * read `field.admin` at all (only `field.required`/`field.defaultValue`/
 * `field.type`/`field.name`/`field.fields` drive column generation) - so a
 * conditionally-shown field still gets a real, always-present column, exactly
 * like every other scalar field in this app. Confirmed by inspection of
 * generate.ts rather than assumed, per this phase's brief - moot here anyway,
 * since MemberSettings/SecuritySettings declare no `admin.condition` field at
 * all (checked directly against both configs).
 *
 * None of these groups nest a group inside a group (registration/access/
 * billing/emails each contain only rows and plain fields) - worth calling out
 * because processFields' own group branch explicitly THROWS on a group found
 * while walking another group's subfields ("... may only contain plain
 * fields ..."), so a future edit that nests a group here would need new
 * schema-generation work, not just new wiring.
 */
export type MemberSettingsDoc = {
  id: number
  registration?: {
    allowSignup?: boolean | null
    requireEmailVerification?: boolean | null
    defaultTier?: string | null
  }
  access?: {
    redirectAfterLogin?: string | null
    membersOnlyRedirect?: string | null
    teaserMode?: string | null
  }
  billing?: {
    currency?: string | null
    allowCancellation?: boolean | null
    proration?: boolean | null
  }
  emails?: {
    welcomeSubject?: string | null
    welcomeBody?: string | null
    expiryReminderDays?: number | null
  }
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(memberSettings, MemberSettings, {}, { groupFields: memberSettingsGenerated.groupFields })

export const findMemberSettings = ops.find as unknown as () => Promise<MemberSettingsDoc | null>
export const updateMemberSettings = ops.update as unknown as (
  data: Partial<Omit<MemberSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<MemberSettingsDoc>
