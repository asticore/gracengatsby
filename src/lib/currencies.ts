import type { Currency } from '@/engine/commerce/types'

// The plugin ships USD/EUR/GBP out of the box but not AUD, so we define it
// ourselves and use it as the shop's default (and only) currency.
export const AUD: Currency = {
  code: 'AUD',
  decimals: 2,
  label: 'Australian Dollar',
  symbol: 'A$',
}
