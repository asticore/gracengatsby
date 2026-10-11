import type { Field } from '@/engine'

/** Per-document switch: no ads on this page, post or product. Column `no_ads`. */
export const noAdsField: Field = {
  name: 'noAds',
  type: 'checkbox',
  defaultValue: false,
  label: 'No ads',
  admin: { position: 'sidebar', description: 'Show no ads on this page, even when Ads is on.' },
}
