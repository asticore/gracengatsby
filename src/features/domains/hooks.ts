import { normaliseDomains } from './model'

/**
 * Saves the domain registry only when it is valid, and in its normalised form (lower-case hosts, blank rows
 * dropped, the currency upper-cased). A refused save names every problem, so the admin fixes them in one pass.
 * Language membership is checked against the enabled languages when the registry is read at the edge.
 */
export const domainSettingsBeforeChange = ({ data }: { data?: { domains?: unknown } }): { domains?: unknown } | undefined => {
  if (!data || !Array.isArray(data.domains)) return data

  const { domains, errors } = normaliseDomains(data.domains)
  if (errors.length > 0) throw new Error(`Domains: ${errors.join(' ')}`)

  data.domains = domains.map((domain) => ({
    host: domain.host,
    label: domain.label,
    defaultLocale: domain.defaultLocale,
    currencyHint: domain.currencyHint,
    isPrimary: domain.isPrimary,
    status: domain.status,
    redirectToPrimary: domain.redirectToPrimary,
    allowAdmin: domain.allowAdmin,
  }))
  return data
}
