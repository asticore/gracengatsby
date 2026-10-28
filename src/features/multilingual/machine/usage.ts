/**
 * Machine translation character usage. One row per successful provider call in
 * `eg_machine_translation_usage`: the provider, the language and the count of
 * characters sent. Never the text itself. Raw SQL, like the AI spend table, so the
 * table is not in the drizzle schema (see migrations/20261126_100000_machine_translation.ts).
 *
 * Best effort on write: a failed usage write must not fail a translation the
 * provider already did. Read errors report zero rather than blocking the screen,
 * which is the lesser harm; the admin sees the counter as a number, not a guarantee.
 */

import { monthStartIso } from './config'

export type UsageD1 = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      all: <T>() => Promise<{ results: T[] }>
      run: () => Promise<unknown>
    }
  }
}

async function defaultD1(): Promise<UsageD1> {
  const { rawD1 } = await import('@/features/ecommerce/server/db')
  return (await rawD1()) as unknown as UsageD1
}

export async function recordCharUsage(
  row: { provider: string; locale: string; chars: number; ok: boolean },
  options: { d1?: UsageD1; now?: Date } = {},
): Promise<void> {
  try {
    const db = options.d1 ?? (await defaultD1())
    await db
      .prepare(
        'INSERT INTO eg_machine_translation_usage (created_at, provider, locale, chars, ok) VALUES (?1, ?2, ?3, ?4, ?5)',
      )
      .bind((options.now ?? new Date()).toISOString(), row.provider, row.locale, Math.max(0, Math.round(row.chars)), row.ok ? 1 : 0)
      .run()
  } catch {
    // Usage tracking is best effort.
  }
}

/** Characters sent this calendar month (UTC) by successful calls. */
export async function charsUsedThisMonth(options: { d1?: UsageD1; now?: Date } = {}): Promise<number> {
  try {
    const db = options.d1 ?? (await defaultD1())
    const rows = (
      await db
        .prepare('SELECT COALESCE(SUM(chars), 0) AS chars FROM eg_machine_translation_usage WHERE ok = 1 AND created_at >= ?1')
        .bind(monthStartIso(options.now ?? new Date()))
        .all<{ chars: number }>()
    ).results
    return Math.max(0, Number(rows[0]?.chars) || 0)
  } catch {
    return 0
  }
}
