'use client'

import React, { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { LOCALE_COOKIE, localisedHref, splitLocalePath } from '../detect'
import { localeNativeName } from '../locales'
import type { MultilingualSettings } from '../settings'

/**
 * The visitor's language chooser.
 *
 * A plain `<select>`, not a flag menu. Flags are the traditional choice and
 * the wrong one - a flag names a country, and languages and countries are not
 * the same set; Spanish speakers in Mexico do not click a Spanish flag, and
 * Arabic has no flag at all. Endonyms are unambiguous and need no legend.
 *
 * Changing language navigates rather than re-rendering in place, because the
 * language is in the URL - that is what makes a translated page shareable and
 * indexable. The cookie is written alongside so the next visit to an
 * unprefixed URL remembers the choice.
 */

export type LanguageSwitcherProps = {
  settings: Pick<MultilingualSettings, 'enabled' | 'defaultLocale' | 'activeLocales' | 'showLanguageSwitcher' | 'switcherPosition'>
  /** Where this instance is being rendered, matched against the configured position. */
  slot: 'header' | 'footer'
  /** Translated label, from the interface strings. */
  label?: string
  className?: string
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ settings, slot, label = 'Language', className }) => {
  const router = useRouter()
  const pathname = usePathname() || '/'

  const visible =
    settings.enabled &&
    settings.showLanguageSwitcher &&
    settings.activeLocales.length > 1 &&
    (settings.switcherPosition === 'both' || settings.switcherPosition === slot)

  const { locale: pathLocale, rest } = splitLocalePath(pathname, settings.activeLocales)
  const current = pathLocale ?? settings.defaultLocale

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value
      // A year is long enough to outlast a browsing habit and short enough
      // that a preference set once on a shared machine does not live forever.
      document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`
      router.push(localisedHref(rest, next, settings as MultilingualSettings))
    },
    [rest, router, settings],
  )

  if (!visible) return null

  return (
    <div className={className} data-locale={current}>
      <label>
        <span className="sr-only">{label}</span>
        <select value={current} onChange={onChange} aria-label={label}>
          {settings.activeLocales.map((code) => (
            <option key={code} value={code} lang={code}>
              {localeNativeName(code)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
