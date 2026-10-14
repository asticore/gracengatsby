import type { GoogleEngine } from './auth'
import { googleGet } from './fetchJson'
import type { PickerKind } from './constants'

/**
 * The choices behind each dropdown on the Google connection screen. The mappers
 * are pure (tested without Google); listFor() makes the calls.
 */

export type PickerItem = { value: string; label: string }

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const DIGITS = /^\d{1,20}$/

export const ADSENSE_NAME = /^accounts\/pub-\d{1,30}$/

/** GA4: one entry per property the account can see. Value is the bare property number. */
export function mapGa4Properties(json: unknown): PickerItem[] {
  const summaries = (json as { accountSummaries?: unknown } | null)?.accountSummaries
  if (!Array.isArray(summaries)) return []
  const items: PickerItem[] = []
  for (const account of summaries) {
    const properties = (account as { propertySummaries?: unknown })?.propertySummaries
    if (!Array.isArray(properties)) continue
    for (const property of properties) {
      const raw = str((property as { property?: unknown })?.property).replace(/^properties\//, '')
      if (!DIGITS.test(raw)) continue
      const name = str((property as { displayName?: unknown })?.displayName) || 'Property'
      items.push({ value: raw, label: `${name} (${raw})` })
    }
  }
  return items
}

/** Search Console: one entry per verified site. Value is the site address as Search Console lists it. */
export function mapSearchConsoleSites(json: unknown): PickerItem[] {
  const entries = (json as { siteEntry?: unknown } | null)?.siteEntry
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry) => str((entry as { siteUrl?: unknown })?.siteUrl))
    .filter((url) => url.length > 0 && url.length <= 300)
    .map((url) => ({ value: url, label: url }))
}

/** Tag Manager: one entry per container. Value is "accountId/containerId". */
export function mapTagManagerContainers(
  accounts: { accountId: string; accountName: string; json: unknown }[],
): PickerItem[] {
  const items: PickerItem[] = []
  for (const account of accounts) {
    const containers = (account.json as { container?: unknown } | null)?.container
    if (!Array.isArray(containers)) continue
    for (const container of containers) {
      const containerId = str((container as { containerId?: unknown })?.containerId)
      const publicId = str((container as { publicId?: unknown })?.publicId)
      const name = str((container as { name?: unknown })?.name) || 'Container'
      if (!DIGITS.test(containerId) || !publicId) continue
      items.push({ value: `${account.accountId}/${containerId}`, label: `${account.accountName}: ${name} (${publicId})` })
    }
  }
  return items
}

/** AdSense: one entry per account. Value is the account name, such as accounts/pub-123. */
export function mapAdsenseAccounts(json: unknown): PickerItem[] {
  const accounts = (json as { accounts?: unknown } | null)?.accounts
  if (!Array.isArray(accounts)) return []
  return accounts
    .map((account) => ({ name: str((account as { name?: unknown })?.name), display: str((account as { displayName?: unknown })?.displayName) }))
    .filter((account) => ADSENSE_NAME.test(account.name))
    .map((account) => ({ value: account.name, label: account.display ? `${account.display} (${account.name})` : account.name }))
}

/** The publisher ID inside an AdSense account name: accounts/pub-123 gives pub-123. */
export function publisherIdFrom(accountName: string): string {
  return accountName.replace(/^accounts\//, '')
}

/** The first web data stream's measurement ID (G-...), or '' when there is none. */
export function measurementIdFrom(json: unknown): string {
  const streams = (json as { dataStreams?: unknown } | null)?.dataStreams
  if (!Array.isArray(streams)) return ''
  for (const stream of streams) {
    const id = str((stream as { webStreamData?: { measurementId?: unknown } })?.webStreamData?.measurementId)
    if (/^G-[A-Z0-9]{4,20}$/.test(id)) return id
  }
  return ''
}

/** Reads "accountId/containerId" from a picker value. Null when it is not that shape. */
export function parseTagManagerValue(value: string): { accountId: string; containerId: string } | null {
  const [accountId, containerId, extra] = value.split('/')
  if (extra !== undefined || !DIGITS.test(accountId ?? '') || !DIGITS.test(containerId ?? '')) return null
  return { accountId, containerId }
}

/** Fetches the choices for one dropdown. Throws GoogleApiError when Google refuses. */
export async function listFor(engine: GoogleEngine, kind: PickerKind): Promise<PickerItem[]> {
  if (kind === 'ga4') {
    return mapGa4Properties(await googleGet(engine, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries', { pageSize: 200 }))
  }
  if (kind === 'gsc') {
    return mapSearchConsoleSites(await googleGet(engine, 'https://www.googleapis.com/webmasters/v3/sites'))
  }
  if (kind === 'adsense') {
    return mapAdsenseAccounts(await googleGet(engine, 'https://adsense.googleapis.com/v2/accounts', { pageSize: 50 }))
  }
  const accountsJson = await googleGet<{ account?: unknown }>(engine, 'https://www.googleapis.com/tagmanager/v2/accounts')
  const accounts = Array.isArray(accountsJson?.account) ? accountsJson.account : []
  const withContainers: { accountId: string; accountName: string; json: unknown }[] = []
  for (const account of accounts) {
    const accountId = str((account as { accountId?: unknown })?.accountId)
    if (!DIGITS.test(accountId)) continue
    const accountName = str((account as { name?: unknown })?.name) || accountId
    const json = await googleGet(engine, `https://www.googleapis.com/tagmanager/v2/accounts/${accountId}/containers`)
    withContainers.push({ accountId, accountName, json })
  }
  return mapTagManagerContainers(withContainers)
}
