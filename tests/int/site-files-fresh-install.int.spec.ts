// @vitest-environment node
// Fresh-install proof for the Site files group: an empty D1 must end up with
// every column the generated SeoSettings table declares, plus the Site files
// columns and their hasMany child table, and a second run must change nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { getPlatformProxy } from 'wrangler'

import { seoSettings, seoSettingsGroupFields } from '@/cms/db/schema'
import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

const SETTINGS_TABLE = 'eg_seo_settings'
const SELECT_TABLE = 'eg_seo_settings_site_files_llms_include_collections'

const SITE_FILE_COLUMNS = [
  'site_files_overview',
  'site_files_llms_enabled',
  'site_files_llms_title',
  'site_files_llms_summary',
  'site_files_llms_exclude_paths',
  'site_files_security_txt_contact',
  'site_files_security_txt_expires',
  'site_files_security_txt_policy',
  'site_files_security_txt_languages',
  'site_files_security_txt_custom',
  'site_files_ads_txt',
  'site_files_app_ads_txt',
  'site_files_humans_txt',
  'site_files_manifest_name',
  'site_files_manifest_short_name',
  'site_files_manifest_theme_color',
  'site_files_manifest_background_color',
  'site_files_manifest_display',
  'site_files_server_response_headers',
  'site_files_server_blocked_paths',
]

describe('Site files - fresh install on an empty D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let first: InternalMigrateResult
  let second: InternalMigrateResult

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((row) => row.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    first = await runInternalMigrate(proxy.env.D1, consoleLogger)
    second = await runInternalMigrate(proxy.env.D1, consoleLogger)
  }, 600_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes the first run with zero errors', () => {
    expect(first.errorCount).toBe(0)
  })

  it('adds every Site files column to eg_seo_settings', async () => {
    const columns = await columnsOf(SETTINGS_TABLE)
    for (const column of SITE_FILE_COLUMNS) {
      expect(columns, `${SETTINGS_TABLE} should have ${column}`).toContain(column)
    }
  })

  it('declares llms_enabled as true by default and manifest_display as standalone', async () => {
    const rows = await proxy.env.D1.prepare(
      `SELECT dflt_value AS value, name FROM pragma_table_info('${SETTINGS_TABLE}') WHERE name IN ('site_files_llms_enabled', 'site_files_manifest_display')`,
    ).all()
    const defaults = Object.fromEntries((rows.results as { name: string; value: string | null }[]).map((r) => [r.name, r.value]))
    expect(defaults.site_files_llms_enabled).toBe('true')
    expect(defaults.site_files_manifest_display).toBe("'standalone'")
  })

  it('creates the llms include collections child table with the hasMany select shape', async () => {
    const columns = await columnsOf(SELECT_TABLE)
    expect(columns).toEqual(expect.arrayContaining(['order', 'parent_id', 'value', 'id']))
  })

  it('has every column the generated SeoSettings table declares', async () => {
    const columns = await columnsOf(SETTINGS_TABLE)
    const generated = Object.values(getTableColumns(seoSettings)).map((column) => column.name)
    expect(generated.length).toBeGreaterThan(0)
    for (const column of generated) {
      expect(columns, `generated column ${column}`).toContain(column)
    }
  })

  it('registers the llms collections select inside the siteFiles group', () => {
    const group = seoSettingsGroupFields.find((meta) => meta.name === 'siteFiles')
    expect(group?.selectFieldNames).toEqual(['llmsIncludeCollections'])
  })

  it('finishes the second run with zero errors and no duplicate columns', async () => {
    expect(second.errorCount).toBe(0)
    const columns = await columnsOf(SETTINGS_TABLE)
    for (const column of SITE_FILE_COLUMNS) {
      expect(columns.filter((name) => name === column), column).toHaveLength(1)
    }
  })
})
