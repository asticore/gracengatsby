import type { Field } from '@/engine'

import { adminOnlyFieldAccess } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * The fields of the `socialLogin` group on the Security settings global.
 *
 * Flat on purpose (`googleEnabled`, `googleClientId`, ...): the schema
 * generator cannot nest a group in a group. Column names therefore come out as
 * `social_login_google_enabled` and so on - src/migrations/20261115_100000_social_login.ts
 * lists the same names. Change one, change the other.
 *
 * Every switch is off, and no credential is shipped: each site creates its own
 * app with each provider (see src/features/socialLogin/setupGuides.ts).
 */

const secretAccess = { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }
const secretHooks = { beforeChange: [encryptSecretHook], afterRead: [decryptSecretHook] }

type Spec = { id: string; label: string; apple?: boolean; microsoft?: boolean; idLabel: string; secretLabel: string }

const SPECS: Spec[] = [
  { id: 'google', label: 'Google', idLabel: 'Client ID', secretLabel: 'Client secret' },
  { id: 'github', label: 'GitHub', idLabel: 'Client ID', secretLabel: 'Client secret' },
  { id: 'apple', label: 'Apple', apple: true, idLabel: 'Services ID (client ID)', secretLabel: '' },
  { id: 'facebook', label: 'Facebook', idLabel: 'App ID', secretLabel: 'App secret' },
  { id: 'microsoft', label: 'Microsoft', microsoft: true, idLabel: 'Application (client) ID', secretLabel: 'Client secret value' },
  { id: 'discord', label: 'Discord', idLabel: 'Client ID', secretLabel: 'Client secret' },
]

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const providerFields = (spec: Spec): Field[] => {
  const p = spec.id
  const fields: Field[] = [
    {
      name: `${p}Enabled`,
      type: 'checkbox',
      label: `${spec.label}: allow sign-in`,
      defaultValue: false,
      admin: { description: `Off by default. It will only switch on once the ${spec.label} credentials below are saved.` },
    },
    { name: `${p}ClientId`, type: 'text', label: `${spec.label}: ${spec.idLabel}` },
  ]
  if (!spec.apple) {
    fields.push({
      name: `${p}ClientSecret`,
      type: 'text',
      label: `${spec.label}: ${spec.secretLabel}`,
      access: secretAccess,
      hooks: secretHooks,
      admin: { description: 'Stored encrypted at rest, visible only to admins.' },
    })
  } else {
    fields.push(
      { name: 'appleTeamId', type: 'text', label: 'Apple: Team ID' },
      { name: 'appleKeyId', type: 'text', label: 'Apple: Key ID' },
      {
        name: 'applePrivateKey',
        type: 'textarea',
        label: 'Apple: private key (contents of the .p8 file)',
        access: secretAccess,
        hooks: secretHooks,
        admin: { description: 'Paste the whole file including the BEGIN and END lines. Stored encrypted at rest, visible only to admins.' },
      },
    )
  }
  if (spec.microsoft) {
    fields.push({
      name: 'microsoftTenant',
      type: 'text',
      label: 'Microsoft: tenant',
      defaultValue: 'common',
      admin: { description: '"common" allows work, school and personal accounts. Use a tenant ID or domain to allow one directory only.' },
    })
  }
  fields.push(
    {
      name: `${p}RedirectConfirmed`,
      type: 'checkbox',
      label: `${spec.label}: I have added the redirect URL in ${spec.label}'s console`,
      defaultValue: false,
    },
    { name: `${p}Setup`, type: 'ui', admin: { components: { Field: '@/features/socialLogin/admin/ProviderSetupField#ProviderSetupField' } } },
  )
  return fields
}

export const socialLoginFields: Field[] = [
  {
    name: 'allowSignupViaSocial',
    type: 'checkbox',
    label: 'Let new customers create an account by signing in with a provider',
    defaultValue: true,
    admin: { description: 'Off means social buttons only sign in people who already have an account. New customer accounts are never given extra roles.' },
  },
  {
    name: 'allowAdminSocialLogin',
    type: 'checkbox',
    label: 'Let admins, editors and viewers sign in with a provider',
    defaultValue: false,
    admin: {
      description:
        'Off by default. Even when on, a staff account must first be connected while signed in (Security > Connected accounts). Staff accounts are never linked by email.',
    },
  },
  ...SPECS.flatMap(providerFields),
]

export const SOCIAL_FIELD_NAMES = (): string[] =>
  socialLoginFields.filter((f) => f.type !== 'ui').map((f) => (f as { name: string }).name)

export { cap as capitaliseProvider }
