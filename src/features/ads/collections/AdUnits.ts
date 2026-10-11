import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { parseTargeting, validateAdUnit } from '../validate'
import { validateParams, ADAPTER_CODES } from '../adapters'
import { AD_UNITS_SLUG, AD_UNITS_TABLE } from '../slugs'

/** One place an ad can appear: network, slot, sizes per breakpoint, floor, lazy load and refresh. */
export const AdUnits: CollectionConfig = {
  slug: AD_UNITS_SLUG,
  dbName: AD_UNITS_TABLE,
  labels: { singular: 'Ad unit', plural: 'Ad units' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'network', 'enabled'],
    group: 'Ads',
    description: 'A slot an ad can fill. Place units on pages with Placements or the Ad element. Nothing loads until the visitor accepts marketing cookies.',
  },
  access: {
    create: roleAccess('ad-units', 'create'),
    delete: roleAccess('ad-units', 'delete'),
    read: roleAccess('ad-units', 'read'),
    update: roleAccess('ad-units', 'update'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'key', type: 'text', required: true, admin: { description: 'Short id: lowercase letters, digits and dashes. Used in markup and tracking, so it cannot change safely once live.' } },
    {
      name: 'network',
      type: 'select',
      required: true,
      defaultValue: 'gam',
      options: [
        { label: 'Google Ad Manager (GPT)', value: 'gam' },
        { label: 'Google AdSense (manual unit)', value: 'adsense' },
      ],
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'slotId', type: 'text', admin: { description: 'AdSense only: the data-ad-slot number.', condition: (_: unknown, s: Record<string, unknown>) => s?.network === 'adsense' } },
    { name: 'adsenseResponsive', type: 'checkbox', defaultValue: true, admin: { description: 'AdSense only: fill the width of the column.', condition: (_: unknown, s: Record<string, unknown>) => s?.network === 'adsense' } },
    { name: 'gamPath', type: 'text', admin: { description: 'Ad Manager only: /12345678/site/unit. Blank uses /<network code>/<key>.', condition: (_: unknown, s: Record<string, unknown>) => s?.network !== 'adsense' } },
    {
      type: 'row',
      fields: [
        { name: 'sizesMobile', type: 'text', admin: { width: '33%', description: 'Under 768px, e.g. 320x50, 300x250' } },
        { name: 'sizesTablet', type: 'text', admin: { width: '33%', description: '768px and up' } },
        { name: 'sizesDesktop', type: 'text', admin: { width: '33%', description: '1024px and up' } },
      ],
    },
    { name: 'floorPrice', type: 'number', admin: { description: 'Minimum CPM in USD for header bidding bids (needs the Price Floors module in your Prebid build).' } },
    { name: 'lazyLoad', type: 'checkbox', defaultValue: true, admin: { description: 'Load when the slot nears the screen. Space is reserved either way.' } },
    {
      type: 'row',
      fields: [
        { name: 'refreshEnabled', type: 'checkbox', defaultValue: false, admin: { width: '25%', description: 'Ad Manager only. AdSense forbids refresh.' } },
        { name: 'refreshSeconds', type: 'number', defaultValue: 60, admin: { width: '25%', description: '30 to 600' } },
        { name: 'refreshMax', type: 'number', defaultValue: 10, admin: { width: '25%', description: 'Most refreshes per page view' } },
        { name: 'refreshRequireViewable', type: 'checkbox', defaultValue: true, admin: { width: '25%', description: 'Only refresh while on screen' } },
      ],
    },
    { name: 'targeting', type: 'textarea', admin: { description: 'Ad Manager key-values, one per line: section=news or tags=a,b' } },
    { name: 'prebid', type: 'checkbox', defaultValue: false, admin: { description: 'Offer this unit to the header bidders switched on in Ads settings.' } },
    { name: 'bidderParams', type: 'json', admin: { description: 'Per-bidder overrides, e.g. {"rubicon":{"zoneId":123456}}. Account-level values come from Ads settings.' } },
  ],
  defaultSort: 'name',
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc }) => {
        if (!data) return data
        const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
        const errors = validateAdUnit(merged)
        const overrides = merged.bidderParams
        if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
          for (const [code, params] of Object.entries(overrides as Record<string, unknown>)) {
            if (!ADAPTER_CODES.includes(code)) errors.push(`Unknown bidder "${code.slice(0, 20)}".`)
            else errors.push(...validateParams(code, params))
          }
        } else if (overrides !== null && overrides !== undefined && overrides !== '') errors.push('Bidder params must be a JSON object.')
        void parseTargeting
        if (errors.length) {
          const { ValidationError } = await import('@/localapi/operations')
          throw new ValidationError(errors.map((message) => ({ path: 'name', message })))
        }
        return data
      },
    ],
  },
}
