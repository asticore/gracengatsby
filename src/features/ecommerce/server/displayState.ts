/**
 * What the storefront layout needs for the currency switcher: the shop currency, the shopper's
 * remembered choice (cookie) and the usable extra currencies. Never throws; on any problem the
 * shop simply shows its own currency, as it did before this feature existed.
 */
import { pickSelected, type StorefrontCurrencyState } from '../lib/displayCurrency'
import { listDisplayCurrencyRows, storefrontOptions } from './displayCurrencies'
import { rawD1 } from './db'

export async function loadDisplayState(base: string, cookieValue: string | undefined): Promise<StorefrontCurrencyState> {
  try {
    const d1 = await rawD1()
    const options = storefrontOptions(await listDisplayCurrencyRows(d1 as never), base)
    return { base, selected: pickSelected(cookieValue, options), options }
  } catch {
    return { base, selected: null, options: [] }
  }
}
