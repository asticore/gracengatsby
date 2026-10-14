/**
 * Reads and writes the extra display currencies (table eg_shop_display_currencies). Server only.
 * Every function takes the raw D1 binding and never throws into a page: a missing table means "no extra currencies".
 */
import { effectiveRate, minorDigits, type DisplayCurrencyOption } from '../lib/displayCurrency'
import type { DisplayCurrencyInput } from '../lib/displayCurrencyRows'

type D1 = { prepare: (sql: string) => { bind: (...args: unknown[]) => { all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> } } }

export type DisplayCurrencyRow = {
  code: string
  enabled: number
  sort_order: number
  rate_mode: string
  manual_rate: number | null
  auto_rate: number | null
  auto_rate_base: string | null
  auto_rate_at: string | null
}

const COLUMNS = 'code, enabled, sort_order, rate_mode, manual_rate, auto_rate, auto_rate_base, auto_rate_at'

export async function listDisplayCurrencyRows(d1: D1): Promise<DisplayCurrencyRow[]> {
  try {
    return (await d1.prepare(`SELECT ${COLUMNS} FROM eg_shop_display_currencies ORDER BY sort_order, code`).bind().all<DisplayCurrencyRow>()).results
  } catch {
    return []
  }
}

/**
 * The currencies a shopper can pick: enabled, with a usable rate. An automatic rate counts only
 * when it was fetched for the current shop currency, so a changed base never shows stale numbers.
 */
export function storefrontOptions(rows: DisplayCurrencyRow[], base: string): DisplayCurrencyOption[] {
  const options: DisplayCurrencyOption[] = []
  for (const row of rows) {
    if (row.enabled !== 1) continue
    if (row.rate_mode === 'auto' && row.auto_rate_base !== base) continue
    const rate = effectiveRate(row)
    if (rate === null) continue
    options.push({ code: row.code, rate, digits: minorDigits(row.code) })
  }
  return options
}

/** Replaces the list with the validated one. Rows not in the list are removed; auto rates already fetched are kept. */
export async function saveDisplayCurrencyRows(d1: D1, rows: DisplayCurrencyInput[], now: Date): Promise<void> {
  const stamp = now.toISOString()
  const existing = await listDisplayCurrencyRows(d1)
  const keep = new Set(rows.map((r) => r.code))
  for (const row of existing) {
    if (!keep.has(row.code)) await d1.prepare('DELETE FROM eg_shop_display_currencies WHERE code = ?1').bind(row.code).run()
  }
  for (const [index, row] of rows.entries()) {
    await d1
      .prepare(
        `INSERT INTO eg_shop_display_currencies (code, enabled, sort_order, rate_mode, manual_rate, updated_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(code) DO UPDATE SET enabled = ?2, sort_order = ?3, rate_mode = ?4, manual_rate = ?5, updated_at = ?6`,
      )
      .bind(row.code, row.enabled ? 1 : 0, index, row.rateMode, row.manualRate, stamp)
      .run()
  }
}

/** Stores freshly fetched automatic rates for the codes that were returned. */
export async function storeAutoRate(d1: D1, code: string, rate: number, base: string, now: Date): Promise<void> {
  await d1
    .prepare('UPDATE eg_shop_display_currencies SET auto_rate = ?2, auto_rate_base = ?3, auto_rate_at = ?4 WHERE code = ?1')
    .bind(code, rate, base, now.toISOString())
    .run()
}
