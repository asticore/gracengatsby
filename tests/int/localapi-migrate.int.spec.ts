import { describe, expect, it, vi } from 'vitest'

import type { EngineDb } from '@/migrations/schema/engineBootstrap'
import type { Drizzle, MigrationEntry } from '@/localapi/migrate'
import { nextBatchNumber, readAppliedMigrationNames, runMigrations } from '@/localapi/migrate'

/** Minimal mock of the real drizzle D1 handle - only `.all`/`.run` are ever called by this module. */
function mockDb(allResponses: unknown[][]): { db: Drizzle; runCalls: unknown[] } {
  let allIndex = 0
  const runCalls: unknown[] = []
  const db = {
    all: vi.fn(async () => allResponses[allIndex++] ?? []),
    run: vi.fn(async (query: unknown) => {
      runCalls.push(query)
      return undefined
    }),
  }
  return { db: db as unknown as Drizzle, runCalls }
}

function mockEngineDb(migrationsTableAlreadyExists: boolean): EngineDb {
  return {
    exists: vi.fn(async (table: string) => (table === 'eg_migrations' ? migrationsTableAlreadyExists : false)),
    listTables: vi.fn(async () => []),
    columnsOf: vi.fn(async () => []),
    run: vi.fn(async () => undefined),
    countRows: vi.fn(async () => 0),
  }
}

function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function mockMigration(name: string, upImpl?: () => Promise<void>): MigrationEntry {
  return {
    name,
    up: vi.fn(upImpl ?? (async () => {})),
    down: vi.fn(async () => {}),
  }
}

describe('localapi/migrate - readAppliedMigrationNames', () => {
  it('returns a Set of the names already recorded', async () => {
    const { db } = mockDb([[{ name: 'a' }, { name: 'b' }]])
    const names = await readAppliedMigrationNames(db)
    expect(names).toEqual(new Set(['a', 'b']))
  })

  it('returns an empty Set when eg_migrations has no rows', async () => {
    const { db } = mockDb([[]])
    const names = await readAppliedMigrationNames(db)
    expect(names).toEqual(new Set())
  })
})

describe('localapi/migrate - nextBatchNumber', () => {
  it('returns 1 when there is no migration history yet', async () => {
    const { db } = mockDb([[]])
    expect(await nextBatchNumber(db)).toBe(1)
  })

  it('returns the latest batch + 1, matching real Payload\'s sort-by-name-desc logic', async () => {
    const { db } = mockDb([[{ batch: 3 }]])
    expect(await nextBatchNumber(db)).toBe(4)
  })

  it('treats a null/non-numeric batch value as 0', async () => {
    const { db } = mockDb([[{ batch: null }]])
    expect(await nextBatchNumber(db)).toBe(1)
  })
})

describe('localapi/migrate - runMigrations', () => {
  it('ensures the migrations table exists before reading anything', async () => {
    const engineDb = mockEngineDb(false)
    const { db } = mockDb([[], []])
    await runMigrations({ db, engineDb, logger: mockLogger(), migrations: [] })
    expect(engineDb.exists).toHaveBeenCalledWith('eg_migrations')
    expect(engineDb.run).toHaveBeenCalled() // CREATE TABLE path, since exists() returned false
  })

  it('runs every unapplied migration in order and records each with the same batch number', async () => {
    const { db, runCalls } = mockDb([[{ name: 'm1' }], [{ batch: 5 }]])
    const m1 = mockMigration('m1')
    const m2 = mockMigration('m2')
    const m3 = mockMigration('m3')
    const logger = mockLogger()

    const result = await runMigrations({
      db,
      engineDb: mockEngineDb(true),
      logger,
      migrations: [m1, m2, m3],
    })

    expect(result.skipped).toEqual(['m1'])
    expect(result.ran).toEqual(['m2', 'm3'])
    expect(result.batch).toBe(6)
    expect(m1.up).not.toHaveBeenCalled()
    expect(m2.up).toHaveBeenCalledWith({ db, payload: { logger }, req: {} })
    expect(m3.up).toHaveBeenCalledWith({ db, payload: { logger }, req: {} })
    // One INSERT per migration actually run (m2, m3) - m1 was skipped, no insert for it.
    expect(runCalls).toHaveLength(2)
  })

  it('returns batch: null and an empty ran list when every migration is already applied', async () => {
    const { db } = mockDb([[{ name: 'm1' }, { name: 'm2' }], [{ batch: 2 }]])
    const result = await runMigrations({
      db,
      engineDb: mockEngineDb(true),
      logger: mockLogger(),
      migrations: [mockMigration('m1'), mockMigration('m2')],
    })
    expect(result).toEqual({ ran: [], skipped: ['m1', 'm2'], batch: null })
  })

  it('throws on a failing migration, records nothing for it, and never runs the ones after it', async () => {
    const { db, runCalls } = mockDb([[], []])
    const boom = new Error('boom')
    const m1 = mockMigration('m1')
    const m2 = mockMigration('m2', async () => {
      throw boom
    })
    const m3 = mockMigration('m3')
    const logger = mockLogger()

    await expect(
      runMigrations({ db, engineDb: mockEngineDb(true), logger, migrations: [m1, m2, m3] }),
    ).rejects.toThrow('boom')

    expect(m1.up).toHaveBeenCalled()
    expect(m2.up).toHaveBeenCalled()
    expect(m3.up).not.toHaveBeenCalled()
    // Only m1 succeeded and got recorded - m2's own failed run inserted nothing.
    expect(runCalls).toHaveLength(1)
    expect(logger.error).toHaveBeenCalled()
  })

  it('wraps a non-Error thrown value in a real Error naming the migration', async () => {
    const { db } = mockDb([[], []])
    const m1 = mockMigration('m1', async () => {
      throw 'not an Error instance'
    })
    await expect(runMigrations({ db, engineDb: mockEngineDb(true), logger: mockLogger(), migrations: [m1] })).rejects.toThrow(
      /m1.*failed/,
    )
  })
})
