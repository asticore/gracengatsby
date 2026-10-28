import type { AdminUiLocale } from './locales'
import type { UiDictionary } from './keys'

/**
 * One dynamic import per locale. A bundle that only ever loads `fr` never
 * ships `ja`, `ar` or the rest: the bundler splits each dictionary into its own
 * chunk, and a request fetches only the chunk for the user's language.
 *
 * `en` is not here. It is the source table (`keys.ts`), so it is always
 * present and is the final fallback for every other language.
 */
export const DICTIONARY_LOADERS: Record<
  Exclude<AdminUiLocale, 'en'>,
  () => Promise<{ default: UiDictionary }>
> = {
  es: () => import('./dictionaries/es'),
  fr: () => import('./dictionaries/fr'),
  de: () => import('./dictionaries/de'),
  pt: () => import('./dictionaries/pt'),
  it: () => import('./dictionaries/it'),
  nl: () => import('./dictionaries/nl'),
  ja: () => import('./dictionaries/ja'),
  'zh-Hans': () => import('./dictionaries/zh-Hans'),
  ko: () => import('./dictionaries/ko'),
  ar: () => import('./dictionaries/ar'),
  hi: () => import('./dictionaries/hi'),
  ru: () => import('./dictionaries/ru'),
}
