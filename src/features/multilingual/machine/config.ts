/**
 * Machine translation settings, as the rest of the feature reads them.
 *
 * Settings live on the Languages global (enabled, default provider, per-language
 * overrides, monthly character limit). Keys live on Integrations, encrypted like the
 * other secrets there. Nothing in this file returns a key to a caller that is not
 * server code; `keysPresent` reports presence only.
 */

import { MACHINE_PROVIDER_IDS, isMachineProviderId, type MachineProviderId } from './providers'

/** The settings this feature reads, taken from the multilingual group. */
export type MachineSettings = {
  enabled: boolean
  defaultProvider: MachineProviderId | null
  /** Locale code -> provider, for languages that should use a different one. */
  overrides: Record<string, MachineProviderId>
  /** Characters per calendar month across all providers. 0 means no limit. */
  monthlyCharLimit: number
}

export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  enabled: false,
  defaultProvider: null,
  overrides: {},
  monthlyCharLimit: 0,
}

/**
 * The overrides field is a JSON object of locale -> provider. Tolerant like the
 * translation rules: a malformed value reads as "no overrides", and an unknown
 * provider is dropped rather than failing the whole setting.
 */
export function parseMachineOverrides(value: unknown): Record<string, MachineProviderId> {
  let parsed: unknown = value
  if (typeof value === 'string') {
    if (!value.trim()) return {}
    try {
      parsed = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, MachineProviderId> = {}
  for (const [locale, provider] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) continue
    if (isMachineProviderId(provider)) out[locale] = provider
  }
  return out
}

export function parseMachineCharLimit(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** The provider for one language: its override, else the default. Null when none is set. */
export function providerFor(settings: MachineSettings, locale: string): MachineProviderId | null {
  return settings.overrides[locale] ?? settings.defaultProvider
}

/** Which providers have a key set. Booleans only, safe for the browser. */
export type KeysPresent = Record<MachineProviderId, boolean>

const clean = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * Pulls the machine translation keys out of an Integrations document. The field
 * names are the engine's camel-case names, as read through the engine API.
 */
export function keysFromIntegrations(doc: Record<string, unknown> | null | undefined): Partial<Record<MachineProviderId, string>> & { deeplPlan: string } {
  const translation = (doc?.translation ?? {}) as Record<string, unknown>
  const plan = clean(translation.deeplPlan)
  return {
    google: clean(translation.googleApiKey) ?? undefined,
    deepl: clean(translation.deeplApiKey) ?? undefined,
    claude: clean(doc?.claudeApiKey) ?? undefined,
    openai: clean(doc?.openaiApiKey) ?? undefined,
    deeplPlan: plan ?? 'auto',
  }
}

export function keysPresent(keys: Partial<Record<MachineProviderId, string>>): KeysPresent {
  return {
    google: Boolean(keys.google),
    deepl: Boolean(keys.deepl),
    claude: Boolean(keys.claude),
    openai: Boolean(keys.openai),
  }
}

export const MACHINE_PROVIDER_LIST: readonly MachineProviderId[] = MACHINE_PROVIDER_IDS

/** The first day of the current month, UTC, as the ISO text the usage table stores. */
export function monthStartIso(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`
}

/** Whether `requested` more characters fit under the monthly limit. A limit of 0 never refuses. */
export function checkCharBudget(args: { used: number; requested: number; limit: number }): { ok: boolean; remaining: number | null } {
  if (args.limit <= 0) return { ok: true, remaining: null }
  const remaining = Math.max(0, args.limit - args.used)
  return { ok: args.requested <= remaining, remaining }
}
