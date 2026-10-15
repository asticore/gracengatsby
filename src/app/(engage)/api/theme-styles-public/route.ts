import { NextResponse } from 'next/server'

import { loadThemeStyles } from '@/features/themeStyles/store'

export const dynamic = 'force-dynamic'

/** GET /api/theme-styles-public: names only, for the editor's style pickers. No secrets, no auth. */
export async function GET(): Promise<Response> {
  const { styles } = await loadThemeStyles()
  return NextResponse.json(
    {
      buttons: styles.buttons.map((b) => ({ id: b.id, name: b.name })),
      tables: styles.tables.map((t) => ({ id: t.id, name: t.name })),
      colours: styles.colours.map((c) => ({ id: c.id, name: c.name, value: c.value })),
      typography: styles.typography.map((t) => ({ id: t.id, name: t.name })),
    },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  )
}