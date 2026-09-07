// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createFieldGroup, deleteFieldGroup, findFieldGroupByID, updateFieldGroup } from '@/cms/db'

/**
 * Phase 17: Field Groups - the first collection to prove a nested array
 * field living INSIDE another array's own subfields: `fields` is an array,
 * and each field row can itself carry an `options` array (only meaningful
 * when that row's own `type` is "select"). Confirmed via a real
 * `pragma table_info(eg_field_groups_fields_options)` dump that this child
 * table's `_parent_id` is TEXT, referencing the owning `eg_field_groups_fields`
 * row's own string id - not the top-level `field-groups` document's integer
 * id, unlike every other child table this data layer has generated before
 * Phase 17.
 *
 * `targetCollections` is a hasMany select - the same already-proven
 * mechanism Users' `roles` established (Phase 14), included here alongside
 * the array so this suite also exercises it once for a second collection.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete).
 */
describe('cms/db - field-groups (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteFieldGroup, not engine.delete: this suite's own writes should
      // be cleaned up by the same code under test.
      await deleteFieldGroup(id)
    }
  })

  it('reads a document written by Payload: fields array with a nested options array, in order', async () => {
    const name = `phase17-field-group-a-${Date.now()}`
    const created = await engine.create({
      collection: 'field-groups',
      data: {
        name,
        targetCollections: ['pages', 'events'],
        fields: [
          { label: 'Room name', name: 'room_name', type: 'text', required: true },
          {
            label: 'Colour',
            name: 'colour',
            type: 'select',
            options: [
              { label: 'Red', value: 'red' },
              { label: 'Blue', value: 'blue' },
            ],
          },
        ],
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findFieldGroupByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.name).toBe(name)
    expect(viaOurs?.targetCollections).toEqual(['pages', 'events'])
    expect(viaOurs?.fields).toHaveLength(2)

    const [roomField, colourField] = viaOurs!.fields!
    expect(roomField.name).toBe('room_name')
    expect(roomField.required).toBe(true)
    expect(roomField.options == null || roomField.options.length === 0).toBe(true)

    expect(colourField.name).toBe('colour')
    expect(colourField.options).toHaveLength(2)
    expect(colourField.options?.map((o) => o.value)).toEqual(['red', 'blue'])
  })

  it('writes a document (nested options array included) Payload can read back, in order', async () => {
    const name = `phase17-field-group-b-${Date.now()}`
    const ours = await createFieldGroup({
      name,
      targetCollections: ['products'],
      fields: [
        {
          label: 'Size',
          name: 'size',
          type: 'select',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      ],
    })
    createdIds.push(ours.id)

    expect(ours.fields?.[0].options?.map((o) => o.label)).toEqual(['Small', 'Medium', 'Large'])

    const viaPayload = await engine.findByID({ collection: 'field-groups', id: ours.id, depth: 0 })
    const fields = viaPayload.fields as { name: string; options?: { label: string; value: string }[] }[]
    expect(fields[0].options?.map((o) => o.value)).toEqual(['small', 'medium', 'large'])
    expect(viaPayload.targetCollections).toEqual(['products'])
  })

  it('replaces the nested options array wholesale on update', async () => {
    const name = `phase17-field-group-c-${Date.now()}`
    const created = await createFieldGroup({
      name,
      fields: [
        {
          label: 'Colour',
          name: 'colour',
          type: 'select',
          options: [{ label: 'Red', value: 'red' }],
        },
      ],
    })
    createdIds.push(created.id)

    const updated = await updateFieldGroup(created.id, {
      fields: [
        {
          label: 'Colour',
          name: 'colour',
          type: 'select',
          options: [
            { label: 'Green', value: 'green' },
            { label: 'Yellow', value: 'yellow' },
          ],
        },
      ],
    })
    expect(updated?.fields?.[0].options?.map((o) => o.value)).toEqual(['green', 'yellow'])

    const viaPayload = await engine.findByID({ collection: 'field-groups', id: created.id, depth: 0 })
    const fields = viaPayload.fields as { options?: { value: string }[] }[]
    expect(fields[0].options?.map((o) => o.value)).toEqual(['green', 'yellow'])
  })
})
