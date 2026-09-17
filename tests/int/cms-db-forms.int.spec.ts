// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { createForm, deleteForm, findFormByID, updateForm } from '@/cms/db'

/**
 * Forms: a collection with a `relation` field that uses `hasMany` (1:N
 * relationship, not N:N like EventRsvps' `rel`) - see its own schema in
 * src/cms/db/collections/forms.ts.
 */
describe('cms/db - forms', () => {
  let engine: Engine
  const createdIds: number[] = []

  it('reads a form written by Payload: hasMany relation field', async () => {
    engine = await getEngine()
    const formRef = await engine.create({ collection: 'forms', data: { name: 'Parity form' } })
    createdIds.push(formRef.id as number)

    const submissionRef = await engine.create({
      collection: 'form-submissions',
      data: { form: formRef.id, data: 'test data' },
    })

    const viaOurs = await findFormByID(formRef.id as number)
    expect(viaOurs?.id).toBe(formRef.id)
    expect(viaOurs?.name).toBe('Parity form')
    expect(viaOurs?.submissions).toBeDefined()
  })

  it('writes a form Payload can read back', async () => {
    const ours = await createForm({ name: 'Our form' })
    createdIds.push(ours.id)
    expect(ours.name).toBe('Our form')

    const viaPayload = await engine.findByID({ collection: 'forms', id: ours.id, depth: 0 })
    expect(viaPayload.name).toBe('Our form')
  })

  it('updates a form', async () => {
    const created = await createForm({ name: 'Original name' })
    createdIds.push(created.id)

    const updated = await updateForm(created.id, { name: 'Updated name' })
    expect(updated?.name).toBe('Updated name')

    const viaPayload = await engine.findByID({ collection: 'forms', id: created.id, depth: 0 })
    expect(viaPayload.name).toBe('Updated name')
  })

  afterAll = async () => {
    for (const id of createdIds) {
      await deleteForm(id).catch(() => {})
    }
  }
})
