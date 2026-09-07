// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTranslation, deleteTranslation, findTranslationByID, updateTranslation } from '@/cms/db'

/**
 * Translations - a scalar-only collection (text/select/textarea fields, same
 * shape class as Faqs - no arrays/rels/blocks/joins/select), so
 * createCollectionOps(translations, Translations) needs no extra options.
 * `sourceKind` is a single-value `select`, not `hasMany`, so it lands as a
 * plain text column rather than a child table.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete) because sibling suites
 * exercise the `memberships`, `form-submissions` and `ab-tests` collections
 * against the same local D1 database concurrently.
 */
describe('cms/db - translations (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteTranslation, not engine.delete: this suite's own writes should
      // be cleaned up by the same code under test.
      await deleteTranslation(id)
    }
  })

  it('reads a document written by Payload, including an unset nullable field', async () => {
    const fieldPath = `phase16-translation-a-${Date.now()}`
    const created = await engine.create({
      collection: 'translations',
      data: {
        locale: 'fr',
        sourceKind: 'collection',
        sourceId: 'faqs:1',
        fieldPath,
        sourceText: 'Hello world',
        // value deliberately left unset.
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findTranslationByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.locale).toBe('fr')
    expect(viaOurs?.sourceKind).toBe('collection')
    expect(viaOurs?.sourceId).toBe('faqs:1')
    expect(viaOurs?.fieldPath).toBe(fieldPath)
    expect(viaOurs?.sourceText).toBe('Hello world')
    expect(viaOurs?.value == null).toBe(true)
  })

  it('writes a document Payload can read back', async () => {
    const fieldPath = `phase16-translation-b-${Date.now()}`
    const ours = await createTranslation({
      locale: 'de',
      sourceKind: 'interface',
      sourceId: 'ui',
      fieldPath,
      sourceText: 'Save changes',
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'translations', id: ours.id })
    expect(viaPayload.locale).toBe('de')
    expect(viaPayload.sourceKind).toBe('interface')
    expect(viaPayload.sourceId).toBe('ui')
    expect(viaPayload.fieldPath).toBe(fieldPath)
    expect(viaPayload.sourceText).toBe('Save changes')
  })

  it('updates through the clone adapter and the change round-trips through Payload', async () => {
    const fieldPath = `phase16-translation-c-${Date.now()}`
    const ours = await createTranslation({
      locale: 'es',
      sourceKind: 'global',
      sourceId: 'site-settings',
      fieldPath,
    })
    createdIds.push(ours.id)
    expect(ours.value == null).toBe(true)

    const updated = await updateTranslation(ours.id, { value: 'Configuracion del sitio' })
    expect(updated?.value).toBe('Configuracion del sitio')

    const viaPayload = await engine.findByID({ collection: 'translations', id: ours.id })
    expect(viaPayload.value).toBe('Configuracion del sitio')
    expect(viaPayload.fieldPath).toBe(fieldPath)
  })
})
