import { EMAIL_PROVIDERS } from './connections'
import { resolveProvider } from './providers'
import type { EmailProviderKey, EmailSettingsDoc } from './types'

/**
 * What the admin screens say about connections: per provider whether it is
 * connected, which is the default and which the fallback, and what is still
 * blank. Never includes a key, only names and yes/no. Pure: pass it the merged
 * settings from connections.ts (mergeConnections) and it answers.
 */

export type ProviderStatus = {
  key: EmailProviderKey
  label: string
  connected: boolean
  missing: string[]
  isDefault: boolean
  isFallback: boolean
}

export type ConnectionSummary = {
  providers: ProviderStatus[]
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

export function summariseConnections(settings: EmailSettingsDoc): ConnectionSummary {
  const defaultKey = typeof settings.provider === 'string' ? settings.provider.trim() : ''
  const fallbackRaw = typeof settings.fallbackProvider === 'string' ? settings.fallbackProvider.trim() : ''
  const fallbackKey = fallbackRaw && fallbackRaw !== 'none' ? fallbackRaw : ''

  const providers: ProviderStatus[] = EMAIL_PROVIDERS.map(({ key, label }) => {
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

  const defaultStatus = providers.find((entry) => entry.isDefault)

  return {
    providers,
    emailConnected: Boolean(defaultStatus?.connected),
    defaultLabel: labelFor(defaultKey),
    fallbackLabel: labelFor(fallbackKey),
  }
}
