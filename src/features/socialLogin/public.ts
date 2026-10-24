import type { Engine } from '@/engine'

import { readSocialConfig, usableProviders, type PublicProvider } from './settings'

/** Providers to show on a public screen: enabled and configured, nothing else. Never throws. */
export async function publicProviders(engine: Engine, area: 'account' | 'admin' = 'account'): Promise<PublicProvider[]> {
  try {
    return usableProviders(await readSocialConfig(engine), area)
  } catch {
    return []
  }
}

/** The register screen additionally needs sign-up via social to be allowed. */
export async function registerProviders(engine: Engine): Promise<PublicProvider[]> {
  const config = await readSocialConfig(engine)
  return config.allowSignupViaSocial ? usableProviders(config, 'account') : []
}
