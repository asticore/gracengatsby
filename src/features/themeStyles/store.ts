/**
 * Reads and writes the theme styles document (table eg_theme_styles, row id 1). Server only.
 * Loading never throws: a missing table, row or bad JSON gives the defaults with saved:false.
 */
import { revalidatePath } from 'next/cache'

import { sanitizeThemeStyles } from './sanitize'
import type { ThemeStyles } from './types'

export type ThemeStylesD1 = {
  prepare: (sql: string) => { bind: (...args: unknown[]) => { all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> } }
}

async function defaultD1(): Promise<ThemeStylesD1> {
  const { rawD1 } = await import('@/features/ecommerce/server/db')
  return (await rawD1()) as unknown as ThemeStylesD1
}

export async function loadThemeStyles(d1?: ThemeStylesD1): Promise<{ styles: ThemeStyles; saved: boolean }> {
  try {
    const db = d1 ?? (await defaultD1())
    const rows = (await db.prepare('SELECT data FROM eg_theme_styles WHERE id = 1').bind().all<{ data: string }>()).results
    const data = rows[0]?.data
    if (typeof data !== 'string') return { styles: sanitizeThemeStyles(null), saved: false }
    return { styles: sanitizeThemeStyles(JSON.parse(data)), saved: true }
  } catch {
    return { styles: sanitizeThemeStyles(null), saved: false }
  }
}

export async function saveThemeStyles(input: unknown, d1?: ThemeStylesD1): Promise<ThemeStyles> {
  const styles = sanitizeThemeStyles(input)
  const db = d1 ?? (await defaultD1())
  await db.prepare('CREATE TABLE IF NOT EXISTS eg_theme_styles (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT)').bind().run()
  await db
    .prepare('INSERT INTO eg_theme_styles (id, data, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET data = ?1, updated_at = ?2')
    .bind(JSON.stringify(styles), new Date().toISOString())
    .run()
  try {
    revalidatePath('/', 'layout')
  } catch {
    // Outside a request scope (tests, scripts) there is nothing to revalidate.
  }
  return styles
}
