import type { GlobalConfig } from 'payload'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

export const Integrations: GlobalConfig = {
  slug: 'integrations',
  admin: {
    group: 'Site Settings',
    description:
      'API keys and third-party credentials. Admin-only, encrypted at rest, and never exposed to the public site or its API.',
  },
  access: {
    // Locked down at the global level too, so an unauthenticated REST/GraphQL
    // call to /api/globals/integrations gets nothing back - not just this field.
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    {
      name: 'claudeApiKey',
      type: 'text',
      access: {
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      hooks: {
        beforeChange: [encryptSecretHook],
        afterRead: [decryptSecretHook],
      },
      admin: {
        description:
          'Your Claude API key (console.anthropic.com). Stored encrypted at rest, visible only to admins. Not wired to any feature yet - saved here so it is ready when you build one.',
      },
    },
  ],
}
