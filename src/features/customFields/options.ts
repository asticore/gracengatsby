import { sql } from 'drizzle-orm'

import { getDb } from '@/cms/db/connect'

/**
 * Storage for Options pages: site-wide custom field values that belong to no
 * collection (eg business phone, opening hours). One row per options page slug
 * in eg_custom_field_options, values kept as a JSON object.
 *
 * Raw SQL on the shared db handle, like src/cms/db/scheduledPublishes.ts,
 * because this table is not a collection and has no engine config.
 */

export type OptionValues = Record<string, unknown>

/** Options page slugs are short, lowercase and safe to use inside a merge tag. */
export const OPTION_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isValidOptionSlug(slug: string): boolean {
  return OPTION_SLUG_PATTERN.test(slug)
}

function parseValues(raw: unknown): OptionValues {
  if (typeof raw !== 'string' || raw === '') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as OptionValues) : {}
  } catch {
    return {}
  }
}

export async function getOptionValues(slug: string): Promise<{ values: OptionValues; updatedAt: string | null }> {
  const db = await getDb()
  const rows = (await db.all(
    sql`SELECT \`values\`, updated_at FROM \`eg_custom_field_options\` WHERE slug = ${slug}`,
  )) as { values: string; updated_at: string }[]
  if (!rows[0]) return { values: {}, updatedAt: null }
  return { values: parseValues(rows[0].values), updatedAt: rows[0].updated_at }
}

/** Every stored options page, for the merge-tag context. */
export async function getAllOptionValues(): Promise<Record<string, OptionValues>> {
  const db = await getDb()
  const rows = (await db.all(sql`SELECT slug, \`values\` FROM \`eg_custom_field_options\``)) as { slug: string; values: string }[]
  const out: Record<string, OptionValues> = {}
  for (const row of rows) out[row.slug] = parseValues(row.values)
  return out
}

/** Public helper: one option's stored value, or undefined. Safe in server components. */
export async function getOption(slug: string, name: string): Promise<unknown> {
  try {
    const { values } = await getOptionValues(slug)
    return values[name]
  } catch {
    return undefined
  }
}

export async function saveOptionValues(slug: string, values: OptionValues): Promise<string> {
  const db = await getDb()
  const now = new Date().toISOString()
  const json = JSON.stringify(values)
  await db.run(
    sql`INSERT INTO \`eg_custom_field_options\` (slug, \`values\`, updated_at) VALUES (${slug}, ${json}, ${now})
        ON CONFLICT(slug) DO UPDATE SET \`values\` = excluded.\`values\`, updated_at = excluded.updated_at`,
  )
  return now
}
