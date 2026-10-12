// @vitest-environment node
// The forms builder migration: a fresh install gets every new column, and an
// existing site is upgraded without touching its forms (idempotent, additive).
import { drizzle } from 'drizzle-orm/d1'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { flattenLayout, isPublished, resolveLayout } from '@/features/forms/layout'
import { consoleLogger } from '@/localapi/logger'
import { up } from '@/migrations/20261014_500000_forms_builder'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'

const columns = async (db: D1Database, table: string): Promise<string[]> =>
  ((await db.prepare(`PRAGMA table_info(\`${table}\`)`).all()).results as { name: string }[]).map((row) => row.name)

describe('forms builder migration', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    const outcome = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(outcome.errorCount).toBe(0)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('adds the builder columns to forms, entries and settings', async () => {
    const forms = await columns(proxy.env.D1, 'eg_forms')
    for (const column of ['form_status', 'embed_key', 'layout', 'published_layout', 'form_config']) expect(forms, column).toContain(column)
    const entries = await columns(proxy.env.D1, 'eg_form_submissions')
    for (const column of ['status', 'assignee_id', 'notes', 'source_url', 'consent', 'webhook_deliveries', 'webhook_state', 'webhook_retry_at']) expect(entries, column).toContain(column)
    const settings = await columns(proxy.env.D1, 'eg_form_settings')
    for (const column of ['spam_captcha_provider', 'spam_recaptcha_site_key', 'spam_recaptcha_secret_key', 'spam_recaptcha_min_score']) expect(settings, column).toContain(column)
  })

  it('is recorded as applied', async () => {
    const rows = (await proxy.env.D1.prepare('SELECT name FROM eg_migrations').all()).results as { name: string }[]
    expect(rows.map((row) => row.name)).toContain('20261014_500000_forms_builder')
  })

  it('leaves an existing form untouched, gives it an embed key, and it still reads as a live form', async () => {
    const d1 = proxy.env.D1
    await d1.prepare("INSERT INTO eg_forms (id, title) VALUES (901, 'Legacy contact form')").run()
    await d1.prepare("INSERT INTO eg_forms_fields (_order, _parent_id, id, type, name, label, required) VALUES (1, 901, 'f1', 'text', 'your_name', 'Your name', 1)").run()

    // Running it again (an upgrade of a site that already has forms) must be safe and fill the gap.
    await up({ db: drizzle(d1) as never, payload: undefined as never, req: undefined as never } as never)
    await up({ db: drizzle(d1) as never, payload: undefined as never, req: undefined as never } as never)

    const row = (await d1.prepare('SELECT title, form_status, embed_key, layout FROM eg_forms WHERE id = 901').first()) as {
      title: string
      form_status: string | null
      embed_key: string | null
      layout: string | null
    }
    expect(row.title).toBe('Legacy contact form')
    expect(row.form_status).toBeNull()
    expect(row.layout).toBeNull()
    expect(row.embed_key).toMatch(/^f[0-9a-z]{12}$/)

    const again = (await d1.prepare('SELECT embed_key FROM eg_forms WHERE id = 901').first()) as { embed_key: string }
    expect(again.embed_key).toBe(row.embed_key)

    // The old field list becomes a layout on read, in memory only.
    const form = { id: 901, formStatus: row.form_status as never, fields: [{ type: 'text' as const, name: 'your_name', label: 'Your name', required: true }] }
    expect(isPublished(form)).toBe(true)
    expect(resolveLayout(form).legacy).toBe(true)
    expect(flattenLayout(resolveLayout(form).layout).map((f) => f.name)).toEqual(['your_name'])
  })
})
