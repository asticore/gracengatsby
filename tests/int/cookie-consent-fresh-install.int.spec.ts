// @vitest-environment node
// Cookie consent on a genuinely empty D1: runInternalMigrate alone must add the
// consent group's columns and the cookie-list child table, and a second run
// must change nothing and fail nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { getTableColumns, getTableName } from 'drizzle-orm'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'
import { integrationsGenerated } from '@/cms/db/schema/index'

const CONSENT_COLUMNS = [
  'consent_enabled',
  'consent_mode',
  'consent_policy_version',
  'consent_banner_title',
  'consent_banner_text',
  'consent_accept_label',
  'consent_reject_label',
  'consent_customise_label',
  'consent_save_label',
  'consent_position',
  'consent_theme',
  'consent_banner_background',
  'consent_banner_text_color',
  'consent_button_color',
  'consent_privacy_policy_url',
  'consent_cookie_settings_label',
  'consent_geo_logging',
  'consent_log_consent',
  'consent_consent_mode_v2',
  'consent_head_script_category',
  'consent_body_script_category',
]

const CHILD_COLUMNS = ['_order', '_parent_id', 'id', 'category', 'name', 'provider', 'purpose', 'duration']

describe('cookie consent - fresh install on an empty D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let first: InternalMigrateResult
  let second: InternalMigrateResult

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((r) => r.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    first = await runInternalMigrate(proxy.env.D1, consoleLogger)
    second = await runInternalMigrate(proxy.env.D1, consoleLogger)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes the first run with zero errors', () => {
    expect(first.errorCount).toBe(0)
  })

  it('finishes the second run with zero errors', () => {
    expect(second.errorCount).toBe(0)
  })

  it('adds every consent column to eg_integrations', async () => {
    const columns = await columnsOf('eg_integrations')
    for (const column of CONSENT_COLUMNS) {
      expect(columns, column).toContain(column)
    }
  })

  it('creates the cookie-list child table with the generated shape', async () => {
    const tables = (await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()).results as { name: string }[]
    expect(tables.map((t) => t.name)).toContain('eg_integrations_consent_cookie_list')
    const columns = await columnsOf('eg_integrations_consent_cookie_list')
    for (const column of CHILD_COLUMNS) {
      expect(columns, column).toContain(column)
    }
  })

  it('has every column the generated drizzle schema expects for eg_integrations', async () => {
    const generated = Object.values(getTableColumns(integrationsGenerated.table)).map((column) => column.name)
    const columns = await columnsOf(getTableName(integrationsGenerated.table))
    const missing = generated.filter((name) => !columns.includes(name))
    expect(missing).toEqual([])
  })

  it('leaves consent_mode unset so the legacy requireCookieConsent flag still applies', async () => {
    const row = await proxy.env.D1.prepare(`SELECT consent_mode FROM eg_integrations LIMIT 1`).first<{ consent_mode: string | null }>()
    // Either no row yet (fresh install) or a row whose mode is still NULL.
    expect(row === null || row.consent_mode === null).toBe(true)
  })
})
