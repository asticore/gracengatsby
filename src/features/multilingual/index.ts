/**
 * Public surface of the Multilingual feature. Everything outside this folder
 * imports from here, so the internal layout can change without touching the
 * integration points.
 */

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_OPTIONS,
  findLocale,
  isKnownLocale,
  isRtlLocale,
  localeLabel,
  localeNativeName,
  type LocaleDef,
} from './locales'

export {
  DEFAULT_MULTILINGUAL_SETTINGS,
  MULTILINGUAL_FEATURE_KEY,
  getMultilingualSettings,
  invalidateMultilingualSettingsCache,
  readMultilingualSettingsFromD1,
  type MultilingualSettings,
  type SwitcherPosition,
} from './settings'

export {
  LOCALE_COOKIE,
  detectLocale,
  directionFor,
  localisedHref,
  preferredFromHeader,
  splitLocalePath,
  type LocaleDecision,
} from './detect'

export {
  buildLookup,
  findTranslations,
  saveTranslation,
  sourceLookup,
  sourceTextOf,
  translationKey,
  valueAtPath,
  type TranslationKind,
  type TranslationLookup,
  type TranslationRow,
} from './store'

export {
  INTERFACE_GROUPS,
  INTERFACE_SOURCE_ID,
  INTERFACE_STRINGS,
  interfaceSourceText,
  type InterfaceStringDef,
} from './interfaceStrings'

export {
  TRANSLATABLE_COLLECTIONS,
  sourceIdFor,
  translatableSource,
  type TranslatableFieldDef,
  type TranslatableSourceDef,
} from './translatableFields'

export { Translations } from './translationsCollection'

export { LanguageSwitcher, type LanguageSwitcherProps } from './components/LanguageSwitcher'

// Translation workflow. `isTranslationPublishable(row, settings, currentSourceText?)` is the
// rule the public overlay should use to decide whether a stored translation is shown: with
// review on, only an approved, current one; with review off, any translation with text in it.
export {
  computeTranslationStatus,
  evaluateTranslationWrite,
  effectiveAssignees,
  isTranslationPublishable,
  parseTranslationRules,
  STATUS_LABELS,
  TRANSLATION_STATUSES,
  type TranslationRules,
  type TranslationStatus,
} from './translationStatus'
