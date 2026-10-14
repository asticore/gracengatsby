/**
 * Fetches the automatic exchange rates for the extra display currencies. Called by the hourly cron
 * job (through runJob); an automatic rate is refreshed when it is more than about a day old.
 * Server only. The request carries no secrets and no customer data: only the base currency code.
 */
import { AUTO_RATE_MAX_AGE_HOURS, hoursSince, normaliseDisplayCode, parseRate } from '../lib/displayCurrency'
import { listDisplayCurrencyRows, storeAutoRate } from './displayCurrencies'

export const RATE_API_URL = 'https://open.er-api.com/v6/latest/'

type D1 = Parameters<typeof listDisplayCurrencyRows>[0]

export type RateRefresh = { status: 'skipped' | 'updated'; codes: string[]; missing: string[] }

/**
 * Refreshes automatic rates that are missing, stale, or were fetched for another shop currency.
 * Manual rates are never touched. Throws when the provider cannot be reached, so runJob records the failure.
 */
export async function refreshDisplayRates(
  d1: D1,
  base: string,
  now: Date,
  options: { force?: boolean; fetchFn?: (url: string) => Promise<Response> } = {},
): Promise<RateRefresh> {
  const baseCode = normaliseDisplayCode(base)
  if (!baseCode) throw new Error('The shop currency is not a three-letter code, so display rates were not fetched.')
  const automatic = (await listDisplayCurrencyRows(d1)).filter((r) => r.enabled === 1 && r.rate_mode === 'auto')
  const due = automatic.filter((r) => options.force || r.auto_rate_base !== baseCode || hoursSince(r.auto_rate_at, now) >= AUTO_RATE_MAX_AGE_HOURS)
  if (due.length === 0) return { status: 'skipped', codes: [], missing: [] }

  const fetchFn = options.fetchFn ?? ((url: string): Promise<Response> => fetch(url, { headers: { Accept: 'application/json' } }))
  const res = await fetchFn(`${RATE_API_URL}${baseCode}`)
  if (!res.ok) throw new Error(`The exchange rate service answered with status ${res.status}.`)
  const body = (await res.json().catch((): null => null)) as { result?: unknown; rates?: Record<string, unknown> } | null
  if (!body || body.result !== 'success' || !body.rates) throw new Error('The exchange rate service sent no rates.')

  const codes: string[] = []
  const missing: string[] = []
  for (const row of due) {
    const rate = parseRate(body.rates[row.code])
    if (rate === null) {
      missing.push(row.code)
      continue
    }
    await storeAutoRate(d1, row.code, rate, baseCode, now)
    codes.push(row.code)
  }
  return { status: 'updated', codes, missing }
}
