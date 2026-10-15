import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { BUILT_IN_FONTS, sanitizeInstalledFonts } from '@/features/fonts/installed'
import { loadThemeStyles } from '@/features/themeStyles/store'
import { ThemeStylesClient } from './ThemeStylesClient'

/**
 * Server wrapper for /admin/theme-styles. Administrators only. Loads the saved
 * styles directly (no HTTP hop) plus the installed fonts for the font picker.
 */
export async function ThemeStylesView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!context.isAdmin) redirect('/admin')

  const { styles, saved } = await loadThemeStyles()
  const settings = (await (context.engine as unknown as { findGlobal: (args: Record<string, unknown>) => Promise<{ theme?: { customFonts?: unknown } } | null> })
    .findGlobal({ slug: 'site-settings', depth: 0, user: context.user })
    .catch((): null => null)) ?? null
  const builtInIds = new Set(BUILT_IN_FONTS.map((font) => font.value))
  const fonts = sanitizeInstalledFonts(settings?.theme?.customFonts)
    .filter((font) => !builtInIds.has(font.id))
    .map((font) => ({ id: font.id, label: font.family }))

  return <ThemeStylesClient initialStyles={styles} saved={saved} fonts={fonts} />
}