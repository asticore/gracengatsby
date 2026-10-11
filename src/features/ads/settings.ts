import type { GlobalConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { ADAPTERS } from './adapters'
import { AD_SETTINGS_SLUG, AD_SETTINGS_TABLE } from './slugs'

/** Network accounts, header bidding and privacy. Everything here is public by nature (ids that appear in page code). No secrets are stored. */
export const AdSettings: GlobalConfig = {
  slug: AD_SETTINGS_SLUG,
  label: 'Ads settings',
  dbName: AD_SETTINGS_TABLE,
  admin: { group: 'Ads', description: 'Turn Ads on under Site Settings > Features first. Nothing loads until a visitor grants marketing cookies. A certified CMP is needed for IAB TCF.' },
  access: { read: roleAccess('settings:ad-settings', 'read'), update: roleAccess('settings:ad-settings', 'update') },
  fields: [
    { type: 'group', name: 'general', label: 'General', fields: [
      { name: 'showLabel', type: 'checkbox', defaultValue: true },
      { name: 'label', type: 'text', defaultValue: 'Advertisement' },
    ] },
    { type: 'group', name: 'adsense', label: 'Google AdSense', fields: [
      { name: 'enabled', type: 'checkbox', defaultValue: false },
      { name: 'publisherId', type: 'text', admin: { description: 'ca-pub-1234567890123456' } },
      { name: 'autoAds', type: 'checkbox', defaultValue: false, admin: { description: 'Load AdSense auto ads on every page without a "No ads" switch.' } },
    ] },
    { type: 'group', name: 'gam', label: 'Google Ad Manager', fields: [
      { name: 'enabled', type: 'checkbox', defaultValue: false },
      { name: 'networkCode', type: 'text', admin: { description: 'Digits only, e.g. 12345678' } },
      { name: 'publisherId', type: 'text', admin: { description: 'Optional pub-... id for ads.txt when it differs from AdSense.' } },
      { name: 'singleRequest', type: 'checkbox', defaultValue: true, admin: { description: 'Only used when no unit is lazy loaded.' } },
    ] },
    { type: 'group', name: 'prebid', label: 'Prebid.js header bidding', fields: [
      { name: 'enabled', type: 'checkbox', defaultValue: false },
      { name: 'scriptUrl', type: 'text', admin: { description: 'Your Prebid build: https://cdn.example.com/prebid.js or /prebid.js hosted here. Build it at prebid.org/download with the adapters below (and consentManagement, priceFloors).' } },
      { name: 'timeoutMs', type: 'number', defaultValue: 1000 },
      { name: 'failsafeMs', type: 'number', defaultValue: 3000 },
      { name: 'priceGranularity', type: 'select', defaultValue: 'medium', options: ['low', 'medium', 'high', 'auto', 'dense'].map((v) => ({ label: v, value: v })) },
      { name: 'userSync', type: 'checkbox', defaultValue: true },
      { name: 'userSyncDelayMs', type: 'number', defaultValue: 3000 },
      { name: 'bidders', type: 'json', admin: { description: `Adapters: ${ADAPTERS.map((a) => a.label).join(', ')}. Shape: {"rubicon":{"enabled":true,"sellerId":"1234","params":{"accountId":1,"siteId":2}}}`, components: { Field: '@/features/ads/admin/BiddersField#BiddersField' } } },
    ] },
    { type: 'group', name: 'privacy', label: 'Privacy', fields: [
      { name: 'gdprMode', type: 'select', defaultValue: 'region', options: [
        { label: 'Follow the cookie banner region rules', value: 'region' },
        { label: 'Always treat as GDPR', value: 'always' },
        { label: 'Never', value: 'never' },
      ] },
      { name: 'tcfTimeoutMs', type: 'number', defaultValue: 1500 },
    ] },
    { type: 'group', name: 'adsTxt', label: 'ads.txt', fields: [
      { name: 'generate', type: 'checkbox', defaultValue: true, admin: { description: 'Append lines for enabled networks and bidders to /ads.txt. Your own lines are never changed.' } },
    ] },
  ],
}
