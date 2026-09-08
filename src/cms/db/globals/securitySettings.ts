import { SecuritySettings } from '@/globals/SecuritySettings'

import { createGlobalOps } from '../generic'
import { securitySettings, securitySettingsGenerated } from '../schema'

/**
 * SecuritySettings: same shape class as memberSettings.ts (see its own doc
 * comment) - six top-level `group` fields, each containing only `row`-wrapped
 * or plain scalar subfields (text/textarea/number/checkbox/select), no
 * array/blocks/relationship/hasMany-select/join field anywhere in this
 * config. `generateTable()` plus `groupFields: xGenerated.groupFields`
 * (Courses' `seo` mechanism) is the whole of what this needs.
 *
 * Two groups (`rateLimiting`, `auditLog`) each declare their own field named
 * `enabled` - no collision: processFields' group branch keys each group's
 * columns by `${groupName}${capitalize(subFieldName)}` (confirmed in
 * generate.ts), so these land as distinct `rateLimitingEnabled`/
 * `auditLogEnabled` JS keys / `rate_limiting_enabled`/`audit_log_enabled`
 * columns, never colliding with each other or with a same-named field in any
 * other group.
 *
 * `admin.condition` confirmed UI-only the same way as memberSettings.ts
 * (generate.ts never reads `field.admin`) - moot here too, since this config
 * declares no `admin.condition` field. No group nests another group (each of
 * the six only contains rows/plain fields) - processFields' group branch
 * would throw on that shape, so this stays flagged the same way
 * memberSettings.ts does, in case a future edit adds one.
 *
 * `requireTwoFactorForAdmins` (inside `loginProtection`) is a plain boolean
 * toggle, not a secret - it does not itself hold a 2FA seed/token/secret, so
 * no encryption concern applies to this global. (A real per-admin 2FA secret,
 * if this app ever adds one, would live on Users' own auth columns, not
 * here - flagging only because the brief for this phase asked any
 * secret-shaped field to be called out explicitly rather than assumed safe.)
 */
export type SecuritySettingsDoc = {
  id: number
  loginProtection?: {
    maxLoginAttempts?: number | null
    lockoutMinutes?: number | null
    requireTwoFactorForAdmins?: boolean | null
    sessionTimeoutMinutes?: number | null
  }
  headers?: {
    hsts?: boolean | null
    xFrameOptions?: string | null
    xContentTypeOptions?: boolean | null
    referrerPolicy?: string | null
    permissionsPolicy?: string | null
    contentSecurityPolicy?: string | null
  }
  rateLimiting?: {
    enabled?: boolean | null
    requestsPerMinute?: number | null
    applyToApi?: boolean | null
    applyToForms?: boolean | null
  }
  hardening?: {
    blockProbePaths?: boolean | null
    disableDirectoryListing?: boolean | null
    hideCmsFingerprint?: boolean | null
  }
  auditLog?: {
    enabled?: boolean | null
    retentionDays?: number | null
  }
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(securitySettings, SecuritySettings, {}, { groupFields: securitySettingsGenerated.groupFields })

export const findSecuritySettings = ops.find as unknown as () => Promise<SecuritySettingsDoc | null>
export const updateSecuritySettings = ops.update as unknown as (
  data: Partial<Omit<SecuritySettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SecuritySettingsDoc>
