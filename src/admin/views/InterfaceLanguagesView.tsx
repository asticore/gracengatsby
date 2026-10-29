import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { getAdminUi } from '@/admin/i18n/serverUi'
import {
  ADMIN_UI_LOCALES,
  ADMIN_UI_LOCALE_LABELS,
  UI_STRING_SOURCE,
  loadRawStrings,
  type UiStringKey,
} from '@/features/uiStrings'

import {
  InterfaceLanguagesClient,
  type InterfaceLanguageRow,
  type InterfaceLanguageLocale,
} from './InterfaceLanguagesClient'

/**
 * Admin-only reference page: every key of the admin UI reference table against
 * each supported language. Read-only; strings live in src/features/uiStrings.
 *
 * Status per cell:
 *   source      the English source itself
 *   translated  the locale has its own text, different from English
 *   same        the locale has an entry identical to English (often a real gap, sometimes a shared word)
 *   missing     the locale has no entry, so English is shown
 */
export async function InterfaceLanguagesView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  if (!context.isAdmin) redirect(adminHref('', await getAdminRoot()))

  const ui = await getAdminUi()
  const raw = await Promise.all(ADMIN_UI_LOCALES.map((code) => loadRawStrings(code)))
  const keys = Object.keys(UI_STRING_SOURCE) as UiStringKey[]

  const rows: InterfaceLanguageRow[] = keys.map((key) => {
    const english = UI_STRING_SOURCE[key]
    const values: InterfaceLanguageRow['values'] = {}
    ADMIN_UI_LOCALES.forEach((code, index) => {
      const own = raw[index]?.[key]
      if (code === 'en') values[code] = { text: english, status: 'source' }
      else if (!own) values[code] = { text: english, status: 'missing' }
      else if (own === english) values[code] = { text: own, status: 'same' }
      else values[code] = { text: own, status: 'translated' }
    })
    return { key, english, values }
  })

  const locales: InterfaceLanguageLocale[] = ADMIN_UI_LOCALES.map((code) => ({
    code,
    label: ADMIN_UI_LOCALE_LABELS[code].label,
    native: ADMIN_UI_LOCALE_LABELS[code].native,
  }))

  const coverage: Record<string, number> = {}
  for (const locale of locales) {
    const translated = rows.filter(
      (row) =>
        row.values[locale.code]?.status === 'translated' ||
        row.values[locale.code]?.status === 'source',
    ).length
    coverage[locale.code] = rows.length === 0 ? 0 : Math.round((translated / rows.length) * 100)
  }

  return (
    <InterfaceLanguagesClient
      rows={rows}
      locales={locales}
      coverage={coverage}
      locale={ui.locale}
      dir={ui.dir}
    />
  )
}
