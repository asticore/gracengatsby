// @vitest-environment node
// Content approval on an empty D1: runInternalMigrate alone must create the review columns on every
// drafts collection (live and versions), the review history table and the approval rules columns.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

const REVIEW_COLUMNS = ['review_status', 'review_requested_by_id', 'review_requested_at', 'review_approvals']
const VERSION_REVIEW_COLUMNS = ['version_review_status', 'version_review_requested_by_id', 'version_review_requested_at', 'version_review_approvals']
const APPROVAL_COLUMNS = [
  'approval_enabled',
  'approval_pages_approvals',
  'approval_posts_approvals',
  'approval_events_approvals',
  'approval_courses_approvals',
  'approval_products_approvals',
  'approval_allow_self_approval',
  'approval_notify_reviewers',
  'approval_notify_emails',
]

describe('runInternalMigrate - content approval on an empty D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let outcome: InternalMigrateResult
  let tables: string[]

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((r) => r.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    outcome = await runInternalMigrate(proxy.env.D1, consoleLogger)
    const rows = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    tables = (rows.results as { name: string }[]).map((r) => r.name)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes with zero errors', () => {
    expect(outcome.errorCount).toBe(0)
  })

  it('creates the review history table with its indexes', async () => {
    expect(tables).toContain('eg_review_events')
    const columns = await columnsOf('eg_review_events')
    for (const column of ['collection', 'doc_id', 'doc_title', 'action', 'note', 'actor_id', 'actor_name', 'created_at']) {
      expect(columns, `eg_review_events should have ${column}`).toContain(column)
    }
    const indexes = await proxy.env.D1.prepare(`PRAGMA index_list(\`eg_review_events\`)`).all()
    const names = (indexes.results as { name: string }[]).map((r) => r.name)
    expect(names).toContain('eg_review_events_collection_doc_id_idx')
    expect(names).toContain('eg_review_events_action_created_at_idx')
  })

  it('adds review state to every drafts collection, live and versions', async () => {
    for (const live of ['eg_pages', 'eg_posts', 'eg_events', 'eg_courses', 'eg_products']) {
      if (tables.includes(live)) {
        const columns = await columnsOf(live)
        for (const column of REVIEW_COLUMNS) expect(columns, `${live} should have ${column}`).toContain(column)
      }
      const versions = `_${live}_v`
      if (tables.includes(versions)) {
        const columns = await columnsOf(versions)
        for (const column of VERSION_REVIEW_COLUMNS) expect(columns, `${versions} should have ${column}`).toContain(column)
      }
    }
  })

  it('adds the approval rules to the security settings', async () => {
    expect(tables).toContain('eg_security_settings')
    const columns = await columnsOf('eg_security_settings')
    for (const column of APPROVAL_COLUMNS) expect(columns, `eg_security_settings should have ${column}`).toContain(column)
  })

  it('adds a review events column to the document lock join table', async () => {
    const columns = await columnsOf('eg_locked_documents_rels')
    expect(columns).toContain('eg_review_events_id')
  })

  it('is safe to run a second time', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
    const columns = await columnsOf('eg_pages')
    expect(columns.filter((column) => column === 'review_status')).toHaveLength(1)
  }, 300_000)
})
