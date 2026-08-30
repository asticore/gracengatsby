import type { FeatureKey } from '@/features/registry'

import { DEFAULT_LOCALE, isKnownLocale } from './locales'

/**
 * The values behind the Languages screen, in the shape the rest of the feature
 * wants them.
 *
 * Two readers, for the same reason the Security feature has two: server
 * components and the admin view already hold the engine and go through
 * `getMultilingualSettings()`; anything running before the engine is available
 * (locale detection on a cold isolate) goes through `readSettingsFromD1()`,
 * which is a single-row SELECT cached in isolate memory.
 *
 * Both fail closed to "off". Every other setting here is a preference, but
 * `enabled` is the switch that decides whether visitors see a language
 * chooser at all - and a database hiccup that silently turns multilingual ON
 * for a site that never asked for it is a far worse outcome than one that
 * leaves it off for a minute.
 */

export type SwitcherPosition = 'header' | 'footer' | 'both'

export type MultilingualSettings = {
  /** Both the feature toggle in Site Settings and the switch on this screen. */
  enabled: boolean
  defaultLocale: string
  /** Always includes `defaultLocale`, deduplicated, in configured order. */
  activeLocales: string[]
  fallbackToDefault: boolean
  showLanguageSwitcher: boolean
  switcherPosition: SwitcherPosition
}

export const MULTILINGUAL_FEATURE_KEY: FeatureKey = 'multilingual'

export const DEFAULT_MULTILINGUAL_SETTINGS: MultilingualSettings = {
  enabled: false,
  defaultLocale: DEFAULT_LOCALE,
  activeLocales: [DEFAULT_LOCALE],
  fallbackToDefault: true,
  showLanguageSwitcher: true,
  switcherPosition: 'header',
}

const SETTINGS_TABLE = 'eg_language_settings'
const SITE_SETTINGS_TABLE = 'eg_site_settings'

const asBool = (value: unknown, fallback: boolean): boolean =>
  value === null || value === undefined ? fallback : Boolean(Number(value) || value === true)

const asPosition = (value: unknown): SwitcherPosition =>
  value === 'footer' || value === 'both' ? value : 'header'

/**
 * The default locale is prepended rather than merely allowed, because the rest
 * of the feature treats `activeLocales[0]` as "the column you translate from".
 * A settings screen where somebody unticks their own primary language should
 * not be able to produce a site with no source language.
 */
function normaliseLocales(defaultLocale: string, active: unknown): { defaultLocale: string; activeLocales: string[] } {
  const base = isKnownLocale(defaultLocale) ? defaultLocale : DEFAULT_LOCALE
  const listed = Array.isArray(active) ? active : typeof active === 'string' ? safeParseList(active) : []
  const ordered = [base, ...listed.filter((code): code is string => typeof code === 'string' && isKnownLocale(code))]
  return { defaultLocale: base, activeLocales: [...new Set(ordered)] }
}

/** SQLite stores `hasMany` selects as JSON text when read outside the engine. */
function safeParseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return value.split(',').map((part) => part.trim()).filter(Boolean)
  }
}

// --- Engine-side reader -----------------------------------------------------

type EngineLike = {
  findGlobal: (args: { slug: string; depth?: number }) => Promise<Record<string, unknown>>
}

export async function getMultilingualSettings(engine: EngineLike): Promise<MultilingualSettings> {
  const base = DEFAULT_MULTILINGUAL_SETTINGS

  const [settings, site] = await Promise.all([
    engine.findGlobal({ slug: 'language-settings', depth: 0 }).catch((): null => null),
    engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null),
  ])

  const group = (settings?.multilingual ?? {}) as Record<string, unknown>
  const features = (site?.features ?? {}) as Record<string, boolean | null | undefined>
  const featureOn = features[MULTILINGUAL_FEATURE_KEY] ?? base.enabled

  const { defaultLocale, activeLocales } = normaliseLocales(
    typeof group.defaultLocale === 'string' ? group.defaultLocale : base.defaultLocale,
    group.activeLocales,
  )

  return {
    // Both switches have to be on: the feature toggle governs whether the
    // portal shows the screens at all, this one governs the site's behaviour.
    enabled: Boolean(featureOn) && asBool(group.enabled, base.enabled),
    defaultLocale,
    activeLocales,
    fallbackToDefault: asBool(group.fallbackToDefault, base.fallbackToDefault),
    showLanguageSwitcher: asBool(group.showLanguageSwitcher, base.showLanguageSwitcher),
    switcherPosition: asPosition(group.switcherPosition),
  }
}

// --- Binding-side reader ----------------------------------------------------

const CACHE_TTL_MS = 60_000

let cached: { at: number; value: MultilingualSettings } | null = null

async function getD1(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return context?.env?.D1 ?? null
  } catch {
    return null
  }
}

/**
 * A `hasMany` select is not a column - the engine's SQLite adapter puts each
 * chosen value on its own row in a child table. Going straight to the binding
 * means going to that table by name, and the name only exists once the
 * settings migration has run, so a miss reads as "no extra languages" rather
 * than an error.
 */
const ACTIVE_LOCALES_TABLE = 'eg_language_settings_multilingual_active_locales'

async function readActiveLocaleRows(db: D1Database): Promise<string[]> {
  try {
    const result = await db.prepare(`SELECT value FROM \`${ACTIVE_LOCALES_TABLE}\` ORDER BY \`order\``).all()
    return (result.results ?? [])
      .map((row) => (row as { value?: unknown }).value)
      .filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

export async function readMultilingualSettingsFromD1(): Promise<MultilingualSettings> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value

  let value = DEFAULT_MULTILINGUAL_SETTINGS

  try {
    const db = await getD1()
    if (db) {
      const settings = await db.prepare(`SELECT * FROM \`${SETTINGS_TABLE}\` LIMIT 1`).all()
      const flags = await db.prepare(`SELECT features_multilingual FROM \`${SITE_SETTINGS_TABLE}\` LIMIT 1`).all()

      const row = (settings.results?.[0] ?? {}) as Record<string, unknown>
      const flagRow = (flags.results?.[0] ?? {}) as Record<string, unknown>

      const { defaultLocale, activeLocales } = normaliseLocales(
        typeof row.multilingual_default_locale === 'string'
          ? row.multilingual_default_locale
          : DEFAULT_MULTILINGUAL_SETTINGS.defaultLocale,
        await readActiveLocaleRows(db),
      )

      value = {
        enabled:
          asBool(flagRow.features_multilingual, DEFAULT_MULTILINGUAL_SETTINGS.enabled) &&
          asBool(row.multilingual_enabled, DEFAULT_MULTILINGUAL_SETTINGS.enabled),
        defaultLocale,
        activeLocales,
        fallbackToDefault: asBool(row.multilingual_fallback_to_default, true),
        showLanguageSwitcher: asBool(row.multilingual_show_language_switcher, true),
        switcherPosition: asPosition(row.multilingual_switcher_position),
      }
    }
  } catch {
    value = DEFAULT_MULTILINGUAL_SETTINGS
  }

  cached = { at: now, value }
  return value
}

export function invalidateMultilingualSettingsCache(): void {
  cached = null
}
