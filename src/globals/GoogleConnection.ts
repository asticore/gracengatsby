import type { GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * The Google connection: one Google Cloud OAuth client that the site owner
 * creates once, and the account that was signed in with it. The stored
 * property, site and container choices feed the Google dashboards and fill the
 * GA4 measurement ID and GTM container ID on Integrations when those are blank.
 *
 * The two secret fields are encrypted at rest (src/utilities/secretField.ts)
 * and are admin-only at field level. Their names say "Enc" because that is how
 * they are stored. The client secret is written as plain text and encrypted by
 * the beforeChange hook. Nothing here is ever sent to the browser.
 */

const adminOnlySecret = {
  read: adminOnlyFieldAccess,
  update: adminOnlyFieldAccess,
}

export const GoogleConnection: GlobalConfig = {
  slug: 'google-connection',
  dbName: 'eg_google_connection',
  label: 'Google connection',
  admin: {
    group: 'Settings',
    description: 'Connects the site to Google Analytics, Search Console, Tag Manager and AdSense. Admin-only.',
  },
  access: {
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    {
      name: 'clientId',
      type: 'text',
      label: 'Client ID',
      admin: { description: 'From Google Cloud Console > APIs and services > Credentials. Ends in .apps.googleusercontent.com.' },
    },
    {
      name: 'clientSecretEnc',
      type: 'text',
      label: 'Client secret',
      access: adminOnlySecret,
      hooks: {
        beforeChange: [encryptSecretHook],
        afterRead: [decryptSecretHook],
      },
      admin: { description: 'Shown once when you create the client in Google Cloud. Stored encrypted at rest and never shown again.' },
    },
    {
      name: 'refreshTokenEnc',
      type: 'text',
      label: 'Refresh token',
      access: adminOnlySecret,
      hooks: {
        beforeChange: [encryptSecretHook],
        afterRead: [decryptSecretHook],
      },
      admin: { description: 'Written by Connect with Google. Stored encrypted at rest.' },
    },
    { name: 'connectedEmail', type: 'text', label: 'Connected account', admin: { readOnly: true } },
    { name: 'connectedAt', type: 'text', label: 'Connected at', admin: { readOnly: true } },
    { name: 'scopesGranted', type: 'text', label: 'Permissions granted', admin: { readOnly: true } },
    { name: 'ga4PropertyId', type: 'text', label: 'Analytics property ID', admin: { description: 'The GA4 property the dashboard reads.' } },
    { name: 'ga4MeasurementId', type: 'text', label: 'Analytics measurement ID (G-...)', admin: { description: 'Found from the property\'s web data stream.' } },
    { name: 'searchConsoleSite', type: 'text', label: 'Search Console site', admin: { description: 'The site address exactly as Search Console lists it.' } },
    { name: 'gtmAccountId', type: 'text', label: 'Tag Manager account ID' },
    { name: 'gtmContainerId', type: 'text', label: 'Tag Manager container ID' },
    { name: 'adsenseAccountId', type: 'text', label: 'AdSense account' },
    { name: 'adsensePublisherId', type: 'text', label: 'AdSense publisher ID' },
    { name: 'lastError', type: 'text', label: 'Last error', admin: { readOnly: true } },
  ],
}
