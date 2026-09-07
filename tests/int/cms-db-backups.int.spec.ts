// @vitest-environment node
//
// jsdom's global scope is a separate vm realm from Node's, and its
// TextEncoder().encode() returns a Uint8Array that isn't `instanceof` that
// realm's own Uint8Array - a known jsdom/esbuild incompatibility. wrangler's
// getPlatformProxy() (used below to reach the local D1 emulation, same as
// scripts/prepareEngineTables.mts) shells out to its bundled esbuild, which
// hits exactly that check. This suite is server-only and needs no DOM, so it
// opts out of the project-wide jsdom environment instead of patching globals.
import type { Engine } from '@/engine'

// Imported first and by its own path on purpose: @/engine/index.ts and
// @/engage.config.ts import each other (the config needs buildConfig from
// the engine seam, the seam's getEngine() needs the built config), and
// Vitest's SSR module runner resolves that circularity correctly only when
// @/engage.config is the side entering it, not @/engine - entering from the
// other side leaves `buildConfig` unbound (`buildConfig is not a function`)
// when @/engage.config's top-level buildConfig(...) call runs. Plain Node/tsx
// does not have this problem; this is specific to Vitest's SSR pipeline.
import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createBackup, deleteBackup, findBackupByID, updateBackup } from '@/cms/db'

/**
 * Proves the backups slice of the CMS's own data layer (src/cms/db) agrees
 * with Payload's real adapter on the same table, same write-both-ways
 * pattern as every prior phase:
 *
 * 1. Write a row through Payload's engine, read it back through our adapter.
 * 2. Write a row through our adapter, read it back through Payload's engine.
 * 3. Update a row through our adapter, confirm Payload sees the change.
 *
 * Backups' `access.create`/`update` are `() => false` (see
 * src/features/backups/collection.ts) - nobody writes through Payload's
 * normal HTTP/admin API - but Payload's Local API (`engine.create()`, used
 * here) overrides access control by default, so the pattern is unchanged.
 */
describe('cms/db - backups (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteBackup, not engine.delete: this suite's own writes should be
      // cleaned up by the same code under test.
      await deleteBackup(id)
    }
  })

  it('reads a document written by Payload, including an unset nullable field', async () => {
    const backupId = `phase15-backup-a-${Date.now()}`
    const startedAt = new Date().toISOString()
    const created = await engine.create({
      collection: 'backups',
      data: {
        backupId,
        startedAt,
        triggerSource: 'scheduled',
        contents: 'media+db',
        destination: 's3',
        status: 'running',
        sizeBytes: 1024,
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findBackupByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.backupId).toBe(backupId)
    expect(viaOurs?.startedAt).toBe(startedAt)
    expect(viaOurs?.triggerSource).toBe('scheduled')
    expect(viaOurs?.contents).toBe('media+db')
    expect(viaOurs?.destination).toBe('s3')
    expect(viaOurs?.status).toBe('running')
    expect(viaOurs?.sizeBytes).toBe(1024)
    // finishedAt was never set on create - should come back null/undefined,
    // not throw.
    expect(viaOurs?.finishedAt == null).toBe(true)
  })

  it('writes a document Payload can read back', async () => {
    const backupId = `phase15-backup-b-${Date.now()}`
    const ours = await createBackup({
      backupId,
      triggerSource: 'manual',
      destination: 'r2',
      status: 'running',
      sizeBytes: 2048,
      tablesBackedUp: 12,
      mediaObjects: 3,
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'backups', id: ours.id })
    expect(viaPayload.backupId).toBe(backupId)
    expect(viaPayload.triggerSource).toBe('manual')
    expect(viaPayload.destination).toBe('r2')
    expect(viaPayload.status).toBe('running')
    expect(viaPayload.sizeBytes).toBe(2048)
    expect(viaPayload.tablesBackedUp).toBe(12)
    expect(viaPayload.mediaObjects).toBe(3)
  })

  it('updates a backup from running to completed, Payload sees the change', async () => {
    const backupId = `phase15-backup-c-${Date.now()}`
    const ours = await createBackup({ backupId, status: 'running', destination: 's3' })
    createdIds.push(ours.id)
    expect(ours.status).toBe('running')

    const finishedAt = new Date().toISOString()
    const updated = await updateBackup(ours.id, { status: 'completed', finishedAt, sizeBytes: 4096 })
    expect(updated?.status).toBe('completed')
    expect(updated?.finishedAt).toBe(finishedAt)

    const viaPayload = await engine.findByID({ collection: 'backups', id: ours.id })
    expect(viaPayload.status).toBe('completed')
    expect(viaPayload.finishedAt).toBe(finishedAt)
    expect(viaPayload.sizeBytes).toBe(4096)
  })
})
