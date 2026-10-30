import type { GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * Connected ad platforms for the Tracking screen: the Meta (Facebook) and TikTok
 * app credentials the owner creates once, and the access token each sign-in
 * returns. Tokens and app secrets are encrypted at rest by the field hooks and
 * are admin-only at field level. Nothing here is ever sent to the browser; the
 * screen reads the non-secret status from src/features/tracking/connect/status.ts.
 *
 * The Google sign-in lives on the google-connection global (src/globals/GoogleConnection.ts),
 * so it is not repeated here.
 */

const adminOnlySecret = { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }
const secretHooks = { beforeChange: [encryptSecretHook], afterRead: [decryptSecretHook] }

export const TrackingConnections: GlobalConfig = {
  slug: 'tracking-connections',
  dbName: 'eg_tracking_connections',
  label: 'Tracking connections',
  admin: {
    group: 'Settings',
    description: 'Sign-in connections for Meta (Facebook) and TikTok ad pixels. Admin-only; tokens are encrypted at rest.',
  },
  access: {
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    { name: 'metaAppId', type: 'text', label: 'Meta app ID' },
    {
      name: 'metaAppSecretEnc',
      type: 'text',
      label: 'Meta app secret',
      access: adminOnlySecret,
      hooks: secretHooks,
      admin: { description: 'From Meta for Developers > your app > App settings > Basic. Stored encrypted at rest.' },
    },
    {
      name: 'metaAccessTokenEnc',
      type: 'text',
      label: 'Meta access token',
      access: adminOnlySecret,
      hooks: secretHooks,
      admin: { description: 'Written by Connect with Facebook. Stored encrypted at rest.' },
    },
    { name: 'metaAccountName', type: 'text', label: 'Meta connected account', admin: { readOnly: true } },
    { name: 'metaConnectedAt', type: 'text', label: 'Meta connected at', admin: { readOnly: true } },
    { name: 'metaTokenExpiresAt', type: 'text', label: 'Meta token expires at', admin: { readOnly: true } },
    { name: 'metaError', type: 'text', label: 'Meta last error', admin: { readOnly: true } },
    { name: 'tiktokAppId', type: 'text', label: 'TikTok app ID' },
    {
      name: 'tiktokAppSecretEnc',
      type: 'text',
      label: 'TikTok app secret',
      access: adminOnlySecret,
      hooks: secretHooks,
      admin: { description: 'From the TikTok for Business developer portal, your app. Stored encrypted at rest.' },
    },
    {
      name: 'tiktokAccessTokenEnc',
      type: 'text',
      label: 'TikTok access token',
      access: adminOnlySecret,
      hooks: secretHooks,
      admin: { description: 'Written by Connect with TikTok. Stored encrypted at rest.' },
    },
    { name: 'tiktokAccountName', type: 'text', label: 'TikTok connected account', admin: { readOnly: true } },
    { name: 'tiktokConnectedAt', type: 'text', label: 'TikTok connected at', admin: { readOnly: true } },
    { name: 'tiktokError', type: 'text', label: 'TikTok last error', admin: { readOnly: true } },
  ],
}
