import { EMAIL_PROVIDERS } from './connections'
import { resolveProvider } from './providers'
import type { EmailProviderKey, EmailSettingsDoc } from './types'

/**
 * Which email providers are connected, for the status notice and the admin
 * route (wave 16). Names and yes/no only - never a key. Pure: pass it the merged
 * settings from connections.ts (mergeConnections).
 */

export type ProviderState = {
  key: EmailProviderKey
  label: string
  connected: boolean
  missing: string[]
  isDefault: boolean
  isFallback: boolean
}

export type ProviderStateSummary = {
  providers: ProviderState[]
  /** True when the default provider is connected and can send. */
  emailConnected: boolean
  /** Name of the default provider, or null when none is chosen. */
  defaultLabel: string | null
  /** Name of the fallback provider, or null when none is chosen. */
  fallbackLabel: string | null
}

const labelFor = (key: string | null | undefined): string | null => {
  if (!key) return null
  return EMAIL_PROVIDERS.find((entry) => entry.key === key)?.label ?? null
}

export function summariseProviderState(settings: EmailSettingsDoc): ProviderStateSummary {
  const defaultKey = typeof settings.provider === 'string' ? settings.provider.trim() : ''
  const fallbackRaw = typeof settings.fallbackProvider === 'string' ? settings.fallbackProvider.trim() : ''
  const fallbackKey = fallbackRaw && fallbackRaw !== 'none' ? fallbackRaw : ''

  const providers: ProviderState[] = EMAIL_PROVIDERS.map(({ key, label }) => {
    const resolved = resolveProvider(key, settings)
    return {
      key,
      label,
      connected: resolved.send !== null,
      missing: resolved.missing,
      isDefault: key === defaultKey,
      isFallback: key === fallbackKey,
    }
  })

  const defaultState = providers.find((entry) => entry.isDefault)

  return {
    providers,
    emailConnected: Boolean(defaultState?.connected),
    defaultLabel: labelFor(defaultKey),
    fallbackLabel: labelFor(fallbackKey),
  }
}
