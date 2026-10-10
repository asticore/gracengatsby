// @vitest-environment node
// Fresh-install proof for the media library upgrade: an empty D1 must reach the
// new columns through runInternalMigrate alone, and a second run must be a no-op.
// Same shape as tests/int/internal-migrate-fresh-install.int.spec.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

const MEDIA_COLUMNS = [
  'caption',
  'folder',
  'focal_x',
  'focal_y',
  'crop',
  'credit',
  'license',
  'source_url',
  'source',
  'original_size',
  'optimized_size',
]

const MEDIA_SETTINGS_COLUMNS = ['optimisation_keep_originals', 'stock_unsplash_access_key', 'stock_pexels_api_key', 'stock_pixabay_api_key']

describe('runInternalMigrate - media library upgrade on an empty D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let outcome: InternalMigrateResult

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((row) => row.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    outcome = await runInternalMigrate(proxy.env.D1, consoleLogger)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes with zero errors', () => {
    expect(outcome.errorCount).toBe(0)
  })

  it('adds the library columns to eg_media', async () => {
    const columns = await columnsOf('eg_media')
    for (const column of MEDIA_COLUMNS) expect(columns, `eg_media should have ${column}`).toContain(column)
  })

  it('adds the optimisation and stock key columns to eg_media_settings', async () => {
    const columns = await columnsOf('eg_media_settings')
    for (const column of MEDIA_SETTINGS_COLUMNS) expect(columns, `eg_media_settings should have ${column}`).toContain(column)
  })

  it('stores and reads back a media row with the new fields', async () => {
    const insert = await proxy.env.D1.prepare(
      `INSERT INTO eg_media (alt, folder, focal_x, focal_y, source, original_size, optimized_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind('Test picture', 'products/summer', 25, 75, 'unsplash', 1000, 400, new Date().toISOString(), new Date().toISOString())
      .run()
    expect(insert.success).toBe(true)
    const row = await proxy.env.D1.prepare(`SELECT folder, focal_x, focal_y, source, optimized_size FROM eg_media WHERE alt = ?`).bind('Test picture').first()
    expect(row).toEqual({ folder: 'products/summer', focal_x: 25, focal_y: 75, source: 'unsplash', optimized_size: 400 })
  })

  it('is safe to run a second time and does not duplicate columns', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
    const columns = await columnsOf('eg_media')
    expect(columns.filter((column) => column === 'folder')).toHaveLength(1)
    expect(columns.filter((column) => column === 'focal_x')).toHaveLength(1)
  }, 300_000)
})
