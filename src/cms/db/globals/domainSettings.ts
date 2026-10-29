import { DomainSettings } from '@/globals/DomainSettings'

import { createGlobalOps } from '../generic'
import { domainSettings, domainSettingsDomains } from '../schema'

/**
 * The `domain-settings` global (src/globals/DomainSettings.ts): one row, plus the `domains` array in its child table.
 * Reads at the edge go through src/features/domains/store.ts, not this file.
 */
export type DomainSettingsRow = {
  host?: string | null
  label?: string | null
  defaultLocale?: string | null
  currencyHint?: string | null
  isPrimary?: boolean | null
  status?: 'active' | 'disabled' | null
  redirectToPrimary?: boolean | null
  allowAdmin?: boolean | null
}

export type DomainSettingsDoc = {
  id: number
  domains?: DomainSettingsRow[] | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(domainSettings, DomainSettings, { domains: domainSettingsDomains }, {})

export const findDomainSettings = ops.find as unknown as () => Promise<DomainSettingsDoc | null>
export const updateDomainSettings = ops.update as unknown as (
  data: Partial<Omit<DomainSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<DomainSettingsDoc>
