/**
 * Build with AI spend tracking. One row per provider call in `ai_builder_usage`
 * (counts only: never a brief, an example or any output). Month-to-date totals feed
 * the monthly cap in Integrations. Costs are estimates from list prices and token counts.
 * Raw SQL, like the theme styles store, so the table is not in the drizzle schema.
 */

import { estimateCostMicro, type AiProvider } from './models'
import type { BuilderMode } from './builderGuide'

export type UsageD1 = {
  prepare: (sql: string) => { bind: (...args: unknown[]) => { all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> } }
}

export type UsageRow = {
  userId: string | null
  provider: AiProvider
  model: string
  mode: BuilderMode
  inputTokens: number
  outputTokens: number
  ok: boolean
  /** True when the counts are a chars/4 estimate because the provider sent none. */
  estimated?: boolean
}

export type UsageSummary = {
  /** Month the totals cover, as YYYY-MM (UTC). */
  month: string
  calls: number
  inputTokens: number
  outputTokens: number
  estCostUsd: number
  /** The configured cap in US dollars; 0 means no cap. */
  capUsd: number
  capReached: boolean
}

const CREATE_TABLE =
  'CREATE TABLE IF NOT EXISTS ai_builder_usage (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, created_at TEXT NOT NULL, user_id TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL, input_tokens INTEGER DEFAULT 0 NOT NULL, output_tokens INTEGER DEFAULT 0 NOT NULL, est_cost_micro INTEGER DEFAULT 0 NOT NULL, ok INTEGER DEFAULT 1 NOT NULL, estimated INTEGER DEFAULT 0 NOT NULL)'

async function defaultD1(): Promise<UsageD1> {
  const { rawD1 } = await import('@/features/ecommerce/server/db')
  return (await rawD1()) as unknown as UsageD1
}

/** Rough token count when the provider sends none: about 4 characters per token. */
export const estimateTokensFromChars = (chars: number): number => Math.ceil(Math.max(0, chars) / 4)

/** First instant of the month containing `now`, as an ISO string (UTC), and the YYYY-MM label. */
export function monthStart(now: Date): { iso: string; label: string } {
  const label = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return { iso: `${label}-01T00:00:00.000Z`, label }
}

/**
 * Tables created before the `estimated` column (migration 20270118) get it here too, once per process,
 * so a usage row is never lost while the migration is still pending.
 */
let estimatedColumnChecked = false
async function ensureEstimatedColumn(db: UsageD1): Promise<void> {
  if (estimatedColumnChecked) return
  try {
    await db.prepare('ALTER TABLE ai_builder_usage ADD COLUMN estimated INTEGER DEFAULT 0 NOT NULL').bind().run()
  } catch {
    // Already there (or the table is missing, which CREATE_TABLE handles next time).
  }
  estimatedColumnChecked = true
}

/** Saves one call. Never throws: a failed usage write must not fail the request. */
export async function recordUsage(row: UsageRow, options: { d1?: UsageD1; now?: Date } = {}): Promise<void> {
  try {
    const db = options.d1 ?? (await defaultD1())
    await db.prepare(CREATE_TABLE).bind().run()
    await ensureEstimatedColumn(db)
    const cost = estimateCostMicro(row.provider, row.model, row.inputTokens, row.outputTokens)
    await db
      .prepare(
        'INSERT INTO ai_builder_usage (created_at, user_id, provider, model, mode, input_tokens, output_tokens, est_cost_micro, ok, estimated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)',
      )
      .bind(
        (options.now ?? new Date()).toISOString(),
        row.userId,
        row.provider,
        row.model,
        row.mode,
        row.inputTokens,
        row.outputTokens,
        cost,
        row.ok ? 1 : 0,
        row.estimated ? 1 : 0,
      )
      .run()
  } catch {
    // Spend tracking is best effort.
  }
}

/** Month-to-date totals. A missing table or any read error gives zeros. */
export async function readUsageSummary(capUsd: number, options: { d1?: UsageD1; now?: Date } = {}): Promise<UsageSummary> {
  const { iso, label } = monthStart(options.now ?? new Date())
  const cap = Number.isFinite(capUsd) && capUsd > 0 ? capUsd : 0
  let calls = 0
  let inputTokens = 0
  let outputTokens = 0
  let micro = 0
  try {
    const db = options.d1 ?? (await defaultD1())
    const rows = (
      await db
        .prepare(
          'SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(est_cost_micro), 0) AS micro FROM ai_builder_usage WHERE created_at >= ?1',
        )
        .bind(iso)
        .all<{ calls: number; input_tokens: number; output_tokens: number; micro: number }>()
    ).results
    const r = rows[0]
    if (r) {
      calls = Number(r.calls) || 0
      inputTokens = Number(r.input_tokens) || 0
      outputTokens = Number(r.output_tokens) || 0
      micro = Number(r.micro) || 0
    }
  } catch {
    // No table yet or a read failure: report zero rather than block the builder.
  }
  const estCostUsd = Math.round(micro) / 1_000_000
  return { month: label, calls, inputTokens, outputTokens, estCostUsd, capUsd: cap, capReached: cap > 0 && estCostUsd >= cap }
}
