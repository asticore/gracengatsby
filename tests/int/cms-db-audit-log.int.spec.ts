// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuditLogEntry, deleteAuditLogEntry, findAuditLogEntryByID, updateAuditLogEntry } from '@/cms/db'

/**
 * Audit log - a scalar-only collection (text/number/date/textarea fields,
 * same shape class as Faqs - no arrays/rels/blocks/joins/select), so
 * createCollectionOps(auditLog, AuditLog) needs no extra options.
 *
 * AuditLog's Payload `access.create`/`update`/`delete` are all `() => false`
 * - nobody, not even admins, can write through Payload's normal (HTTP/admin)
 * API. Payload's Local API (`engine.create()`, used below) overrides access
 * control by default, so the usual write-both-ways parity pattern still
 * applies unchanged.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete) because a sibling suite
 * exercises the `backups` collection against the same local D1 database
 * concurrently.
 */
describe('cms/db - audit-log (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteAuditLogEntry, not engine.delete: this suite's own writes
      // should be cleaned up by the same code under test.
      await deleteAuditLogEntry(id)
    }
  })

  it('reads a document written by Payload, including an unset nullable field', async () => {
    const action = `phase15-audit-a-${Date.now()}`
    const created = await engine.create({
      collection: 'audit-log',
      data: {
        action,
        actorEmail: 'admin@example.com',
        collectionSlug: 'faqs',
        documentId: '42',
        ip: '127.0.0.1',
        // userAgent deliberately left unset.
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findAuditLogEntryByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.action).toBe(action)
    expect(viaOurs?.actorEmail).toBe('admin@example.com')
    expect(viaOurs?.collectionSlug).toBe('faqs')
    expect(viaOurs?.documentId).toBe('42')
    expect(viaOurs?.ip).toBe('127.0.0.1')
    expect(viaOurs?.userAgent == null).toBe(true)
  })

  it('writes a document Payload can read back', async () => {
    const action = `phase15-audit-b-${Date.now()}`
    const ours = await createAuditLogEntry({
      action,
      actorEmail: 'writer@example.com',
      detail: 'created via the clone adapter',
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'audit-log', id: ours.id })
    expect(viaPayload.action).toBe(action)
    expect(viaPayload.actorEmail).toBe('writer@example.com')
    expect(viaPayload.detail).toBe('created via the clone adapter')
  })

  it('updates through the clone adapter and the change round-trips through Payload', async () => {
    const action = `phase15-audit-c-${Date.now()}`
    const ours = await createAuditLogEntry({ action, detail: 'original' })
    createdIds.push(ours.id)

    const updated = await updateAuditLogEntry(ours.id, { detail: 'updated' })
    expect(updated?.detail).toBe('updated')

    const viaPayload = await engine.findByID({ collection: 'audit-log', id: ours.id })
    expect(viaPayload.detail).toBe('updated')
    expect(viaPayload.action).toBe(action)
  })
})
