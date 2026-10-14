// @vitest-environment node
/**
 * Hourly data clean-up: the pure planner (what runs, and when things are old enough)
 * and the runner, driven by a fake engine and a fake database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCleanupDb, deleteEntryFiles } = vi.hoisted(() => ({
  getCleanupDb: vi.fn(),
  deleteEntryFiles: vi.fn(async () => 0),
}))

vi.mock('@/features/cleanup/guard', () => ({ getCleanupDb }))
vi.mock('@/features/forms/maintenance', () => ({ deleteEntryFiles }))
vi.mock('@/features/security/auditLog', () => ({ AUDIT_TABLE: 'eg_audit_log' }))

import {
  CLEANUP_BATCH,
  DEFAULT_CLEANUP_POLICY,
  cleanupPolicyFrom,
  cutoffFor,
  emailRetentionDays,
  isOlderThan,
  isSafeIsoStamp,
  planCleanup,
  versionTablesFrom,
} from '@/features/cleanup/schedulePlan'
import { runScheduledCleanup } from '@/features/cleanup/scheduledCleanup'

const NOW = new Date('2026-10-14T12:00:00.000Z')
const DAY = 86_400_000

describe('clean-up policy', () => {
  it('defaults to off, with the agreed day counts', () => {
    expect(cleanupPolicyFrom(undefined)).toEqual(DEFAULT_CLEANUP_POLICY)
    expect(DEFAULT_CLEANUP_POLICY).toEqual({
      enabled: false,
      keepVersionsPerDoc: 20,
      deleteTrashedAfterDays: 30,
      deleteFormSubmissionsAfterDays: 0,
      deleteAuditLogAfterDays: 180,
      deleteEmailLogAfterDays: 90,
    })
  })

  it('reads D1 checkbox values stored as 0 and 1', () => {
    expect(cleanupPolicyFrom({ enabled: 1 }).enabled).toBe(true)
    expect(cleanupPolicyFrom({ enabled: 0 }).enabled).toBe(false)
    expect(cleanupPolicyFrom({ enabled: true }).enabled).toBe(true)
    expect(cleanupPolicyFrom({ enabled: 'yes' }).enabled).toBe(false)
  })

  it('keeps 0 as "never" for trash, form entries and audit log', () => {
    const policy = cleanupPolicyFrom({ enabled: true, deleteTrashedAfterDays: 0, deleteFormSubmissionsAfterDays: 0, deleteAuditLogAfterDays: 0 })
    expect(policy.deleteTrashedAfterDays).toBe(0)
    expect(policy.deleteFormSubmissionsAfterDays).toBe(0)
    expect(policy.deleteAuditLogAfterDays).toBe(0)
  })

  it('clamps out-of-range numbers and rounds fractions', () => {
    const policy = cleanupPolicyFrom({ keepVersionsPerDoc: 0, deleteTrashedAfterDays: -5, deleteAuditLogAfterDays: 99999, deleteEmailLogAfterDays: 0, deleteFormSubmissionsAfterDays: 7.9 })
    expect(policy.keepVersionsPerDoc).toBe(1)
    expect(policy.deleteTrashedAfterDays).toBe(0)
    expect(policy.deleteAuditLogAfterDays).toBe(3650)
    expect(policy.deleteEmailLogAfterDays).toBe(1)
    expect(policy.deleteFormSubmissionsAfterDays).toBe(7)
  })

  it('falls back to defaults for non-numeric values', () => {
    const policy = cleanupPolicyFrom({ keepVersionsPerDoc: 'lots', deleteTrashedAfterDays: null, deleteAuditLogAfterDays: NaN })
    expect(policy.keepVersionsPerDoc).toBe(20)
    expect(policy.deleteTrashedAfterDays).toBe(30)
    expect(policy.deleteAuditLogAfterDays).toBe(180)
  })

  it('treats a non-object as no settings at all', () => {
    expect(cleanupPolicyFrom('nope')).toEqual(DEFAULT_CLEANUP_POLICY)
    expect(cleanupPolicyFrom(42)).toEqual(DEFAULT_CLEANUP_POLICY)
  })
})

describe('clean-up plan', () => {
  it('plans nothing while clean-up is off, whatever the day counts say', () => {
    expect(planCleanup(DEFAULT_CLEANUP_POLICY, NOW)).toEqual([])
  })

  it('plans versions first, then trash, forms and audit, with cut-offs', () => {
    const steps = planCleanup({ ...DEFAULT_CLEANUP_POLICY, enabled: true, deleteFormSubmissionsAfterDays: 14 }, NOW)
    expect(steps.map((s) => s.kind)).toEqual(['versions', 'trash', 'forms', 'audit'])
    expect(steps[0]).toEqual({ kind: 'versions', keep: 20 })
    expect(steps[1]).toEqual({ kind: 'trash', cutoff: new Date(NOW.getTime() - 30 * DAY).toISOString() })
    expect(steps[2]).toEqual({ kind: 'forms', cutoff: new Date(NOW.getTime() - 14 * DAY).toISOString() })
    expect(steps[3]).toEqual({ kind: 'audit', cutoff: new Date(NOW.getTime() - 180 * DAY).toISOString() })
  })

  it('leaves out any step set to never', () => {
    const steps = planCleanup({ ...DEFAULT_CLEANUP_POLICY, enabled: true, deleteTrashedAfterDays: 0, deleteAuditLogAfterDays: 0 }, NOW)
    expect(steps.map((s) => s.kind)).toEqual(['versions'])
  })

  it('carries the chosen version count through', () => {
    const steps = planCleanup({ ...DEFAULT_CLEANUP_POLICY, enabled: true, keepVersionsPerDoc: 3 }, NOW)
    expect(steps[0]).toEqual({ kind: 'versions', keep: 3 })
  })

  it('cutoffFor returns null for zero, negative and non-finite days', () => {
    expect(cutoffFor(NOW, 0)).toBeNull()
    expect(cutoffFor(NOW, -1)).toBeNull()
    expect(cutoffFor(NOW, Number.NaN)).toBeNull()
    expect(cutoffFor(NOW, 1)).toBe('2026-10-13T12:00:00.000Z')
  })

  it('cutoffFor steps back across a month boundary by whole days', () => {
    expect(cutoffFor(new Date('2026-03-01T00:00:00.000Z'), 1)).toBe('2026-02-28T00:00:00.000Z')
  })
})

describe('email log retention', () => {
  it('keeps the built-in 90 days while clean-up is off', () => {
    expect(emailRetentionDays({ ...DEFAULT_CLEANUP_POLICY, enabled: false, deleteEmailLogAfterDays: 30 })).toBe(90)
  })

  it('follows the setting while clean-up is on', () => {
    expect(emailRetentionDays({ ...DEFAULT_CLEANUP_POLICY, enabled: true, deleteEmailLogAfterDays: 30 })).toBe(30)
  })
})

describe('eligibility', () => {
  const cutoff = '2026-10-01T00:00:00.000Z'

  it('is old enough only when strictly before the cut-off', () => {
    expect(isOlderThan('2026-09-30T23:59:59.999Z', cutoff)).toBe(true)
    expect(isOlderThan(cutoff, cutoff)).toBe(false)
    expect(isOlderThan('2026-10-02T00:00:00.000Z', cutoff)).toBe(false)
  })

  it('compares real times, not text, so offsets and fractions do not mislead', () => {
    // 01:00 on 1 October at +02:00 is 23:00 UTC on 30 September: older than the cut-off.
    expect(isOlderThan('2026-10-01T01:00:00+02:00', cutoff)).toBe(true)
    // 23:00 on 30 September at -02:00 is 01:00 UTC on 1 October: not older.
    expect(isOlderThan('2026-09-30T23:00:00-02:00', cutoff)).toBe(false)
  })

  it('never treats a missing or unreadable stamp as old enough', () => {
    expect(isOlderThan(null, cutoff)).toBe(false)
    expect(isOlderThan(undefined, cutoff)).toBe(false)
    expect(isOlderThan('', cutoff)).toBe(false)
    expect(isOlderThan('not a date', cutoff)).toBe(false)
  })

  it('accepts only generated ISO timestamps as raw SQL input', () => {
    expect(isSafeIsoStamp('2026-10-01T00:00:00.000Z')).toBe(true)
    expect(isSafeIsoStamp('2026-10-01T00:00:00Z')).toBe(true)
    expect(isSafeIsoStamp("2026-10-01'; DROP TABLE x; --")).toBe(false)
    expect(isSafeIsoStamp('yesterday')).toBe(false)
  })
})

describe('version tables', () => {
  it('finds the version copies of collections and skips their child tables', () => {
    const tables = [
      'eg_pages',
      '_eg_pages_v',
      '_eg_pages_v_blocks_hero',
      '_eg_posts_v',
      '_eg_events_v',
      'eg_pages_blocks_hero',
    ]
    expect(versionTablesFrom(tables)).toEqual(['_eg_pages_v', '_eg_posts_v', '_eg_events_v'])
  })

  it('leaves the users and media version tables alone', () => {
    expect(versionTablesFrom(['_eg_users_v', '_eg_media_v', '_eg_products_v'])).toEqual(['_eg_products_v'])
  })
})

describe('runner', () => {
  type Doc = Record<string, unknown> & { id: number }
  const docsByCollection: Record<string, Doc[]> = {}
  let engine: {
    findGlobal: ReturnType<typeof vi.fn>
    find: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  let db: { listTables: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    for (const key of Object.keys(docsByCollection)) delete docsByCollection[key]
    deleteEntryFiles.mockClear()
    engine = {
      findGlobal: vi.fn(async () => ({ cleanup: { enabled: true, keepVersionsPerDoc: 5, deleteTrashedAfterDays: 30, deleteAuditLogAfterDays: 0, deleteFormSubmissionsAfterDays: 0 } })),
      find: vi.fn(async (args: { collection: string; limit: number }) => ({ docs: (docsByCollection[args.collection] ?? []).slice(0, args.limit) })),
      delete: vi.fn(async (args: { collection: string; id: number }) => {
        docsByCollection[args.collection] = (docsByCollection[args.collection] ?? []).filter((d) => d.id !== args.id)
        return {}
      }),
    }
    db = {
      listTables: vi.fn(async () => ['_eg_pages_v', '_eg_pages_v_blocks_hero', 'eg_audit_log']),
      run: vi.fn(async () => ({ meta: { changes: 3 } })),
    }
    getCleanupDb.mockResolvedValue(db)
  })

  it('does nothing and reports so when clean-up is off', async () => {
    engine.findGlobal.mockResolvedValueOnce({ cleanup: { enabled: false } })
    const report = await runScheduledCleanup(engine as never, NOW)
    expect(report).toEqual({ ran: false, removed: {}, errors: [] })
    expect(db.run).not.toHaveBeenCalled()
  })

  it('does nothing when the settings cannot be read', async () => {
    engine.findGlobal.mockRejectedValueOnce(new Error('down'))
    const report = await runScheduledCleanup(engine as never, NOW)
    expect(report.ran).toBe(false)
  })

  it('keeps the newest versions per document using a window query with the batch cap', async () => {
    await runScheduledCleanup(engine as never, NOW)
    const sql = db.run.mock.calls.map((c) => c[0] as string)
    const versionSql = sql.find((s) => s.includes('_eg_pages_v'))!
    expect(versionSql).toContain('ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY id DESC)')
    expect(versionSql).toContain('rn > 5')
    expect(versionSql).toContain(`LIMIT ${CLEANUP_BATCH}`)
    expect(sql.some((s) => s.includes('_eg_pages_v_blocks_hero'))).toBe(false)
  })

  it('removes audit rows older than the cut-off with a safe, validated stamp', async () => {
    engine.findGlobal.mockResolvedValueOnce({ cleanup: { enabled: true, deleteAuditLogAfterDays: 10, deleteTrashedAfterDays: 0 } })
    await runScheduledCleanup(engine as never, NOW)
    const audit = db.run.mock.calls.map((c) => c[0] as string).find((s) => s.includes('eg_audit_log'))!
    expect(audit).toContain(`created_at < '${new Date(NOW.getTime() - 10 * DAY).toISOString()}'`)
  })

  it('deletes trashed documents past the window and leaves recent ones', async () => {
    docsByCollection.pages = [
      { id: 1, trashedAt: '2026-08-01T00:00:00.000Z' },
      { id: 2, trashedAt: '2026-10-10T00:00:00.000Z' },
    ]
    const report = await runScheduledCleanup(engine as never, NOW)
    const deletes = engine.delete.mock.calls.map((c) => (c[0] as { id: number }).id)
    expect(deletes).toContain(1)
    expect(deletes).not.toContain(2)
    expect(report.removed.trash).toBeGreaterThanOrEqual(1)
  })

  it('deletes form entries and their files past the window', async () => {
    engine.findGlobal.mockResolvedValueOnce({ cleanup: { enabled: true, deleteFormSubmissionsAfterDays: 7, deleteTrashedAfterDays: 0, deleteAuditLogAfterDays: 0 } })
    docsByCollection['form-submissions'] = [{ id: 9, values: { file: { key: 'a.pdf' } } }]
    await runScheduledCleanup(engine as never, NOW)
    expect(deleteEntryFiles).toHaveBeenCalledWith({ file: { key: 'a.pdf' } })
    expect(engine.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'form-submissions', id: 9 }))
  })

  it('keeps going when one step fails, and reports the error', async () => {
    docsByCollection.pages = [{ id: 1, trashedAt: '2026-08-01T00:00:00.000Z' }]
    db.run.mockRejectedValueOnce(new Error('boom'))
    const report = await runScheduledCleanup(engine as never, NOW)
    expect(report.errors.some((e) => e.includes('boom'))).toBe(true)
    // The versions step failed, but the trash step after it still ran.
    expect(engine.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'pages', id: 1 }))
  })

  it('never throws, even if the database is unavailable', async () => {
    getCleanupDb.mockResolvedValueOnce(null)
    await expect(runScheduledCleanup(engine as never, NOW)).resolves.toBeDefined()
  })
})
