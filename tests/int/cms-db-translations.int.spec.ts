// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
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
describe('cms/db - translations (wired into engageD1Adapter)', () => {
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

  it('cuts over cleanly: engine.find/update/delete for translations go through our own adapter', async () => {
    const marker = `adaptercutover-${Date.now()}`
    const a = await engine.create({ collection: 'translations', data: { locale: 'fr', sourceKind: 'collection', sourceId: 'faqs:1', fieldPath: `${marker}-a` } })
    const b = await engine.create({ collection: 'translations', data: { locale: 'fr', sourceKind: 'collection', sourceId: 'faqs:1', fieldPath: `${marker}-b` } })
    createdIds.push(a.id as number, b.id as number)

    // engine.find -> adapter.find -> findTranslationsPaginated.
    const listed = await engine.find({ collection: 'translations', where: { fieldPath: { like: marker } }, sort: 'fieldPath', limit: 10 })
    expect(listed.docs.map((d) => d.fieldPath)).toEqual([`${marker}-a`, `${marker}-b`])
    expect(listed.totalDocs).toBe(2)

    // engine.update (by id) -> adapter.updateOne -> updateTranslation.
    const updated = await engine.update({ collection: 'translations', id: a.id, data: { value: 'cutover value' } })
    expect(updated.value).toBe('cutover value')
    const reread = await findTranslationByID(a.id as number)
    expect(reread?.value).toBe('cutover value')

    // engine.delete (by id) -> adapter.deleteOne (resolves id from `where`) -> deleteTranslation.
    const deletedDoc = await engine.delete({ collection: 'translations', id: b.id })
    expect(deletedDoc.fieldPath).toBe(`${marker}-b`)
    expect(await findTranslationByID(b.id as number)).toBeNull()
    createdIds.splice(createdIds.indexOf(b.id as number), 1)
  })
})
