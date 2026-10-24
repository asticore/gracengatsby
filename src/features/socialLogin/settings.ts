import type { Engine } from '@/engine'

import {
  PROVIDER_IDS,
  PROVIDERS,
  emptySocialConfig,
  isUsable,
  safeTenant,
  type ProviderId,
  type SocialConfig,
} from './providers'
import { capitalise } from './util'

/** Reads the `socialLogin` group of the Security settings global. Secrets are decrypted: server use only. */

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function configFromDoc(doc: Record<string, unknown> | null | undefined): SocialConfig {
  const config = emptySocialConfig()
  if (!doc) return config
  const group = (doc.socialLogin && typeof doc.socialLogin === 'object' ? doc.socialLogin : {}) as Record<string, unknown>
  const get = (key: string): unknown => (key in group ? group[key] : doc[`socialLogin${capitalise(key)}`])

  config.allowSignupViaSocial = get('allowSignupViaSocial') !== false
  config.allowAdminSocialLogin = get('allowAdminSocialLogin') === true
  for (const id of PROVIDER_IDS) {
    const p = config.providers[id]
    p.enabled = get(`${id}Enabled`) === true
    p.clientId = text(get(`${id}ClientId`))
    p.clientSecret = text(get(`${id}ClientSecret`))
    p.redirectConfirmed = get(`${id}RedirectConfirmed`) === true
  }
  const apple = config.providers.apple
  apple.teamId = text(get('appleTeamId'))
  apple.keyId = text(get('appleKeyId'))
  apple.privateKey = text(get('applePrivateKey'))
  config.providers.microsoft.tenant = safeTenant(text(get('microsoftTenant')))
  return config
}

export async function readSocialConfig(engine: Pick<Engine, 'findGlobal'>): Promise<SocialConfig> {
  try {
    const doc = await engine.findGlobal({ slug: 'security-settings', depth: 0, overrideAccess: true })
    return configFromDoc(doc as Record<string, unknown> | null)
  } catch {
    // Unreadable settings means no provider is usable: fail closed.
    return emptySocialConfig()
  }
}

export type PublicProvider = { id: ProviderId; label: string }

/** What the sign-in screens may know: which providers to offer. No credentials. */
export function usableProviders(config: SocialConfig, area: 'account' | 'admin' = 'account'): PublicProvider[] {
  if (area === 'admin' && !config.allowAdminSocialLogin) return []
  return PROVIDER_IDS.filter((id) => isUsable(id, config.providers[id])).map((id) => ({ id, label: PROVIDERS[id].label }))
}
