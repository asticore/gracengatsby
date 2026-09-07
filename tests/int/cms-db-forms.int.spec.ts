// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createForm, deleteForm, findFormByID, updateForm } from '@/cms/db'

/**
 * Phase 17: Forms - the second, harder half of the nested-array-in-array
 * capability Field Groups proved first. `fields` is an array whose own
 * subfields include a direct nested array (`options`, same mechanism as
 * Field Groups'), THREE groups flattened onto the array's own child table
 * (`calculation`/`pricing`/`conditional` - confirmed against the real
 * `calculation_formula`/`pricing_priced`/`conditional_enabled` columns on
 * `eg_forms_fields`), and - `conditional` specifically - an array nested
 * INSIDE that group (`rules`, confirmed via a real
 * `pragma table_info(eg_forms_fields_conditional_rules)` dump: same TEXT
 * `_parent_id` scheme as a directly-nested array, pointing at the owning
 * `eg_forms_fields` row's own string id - a group has no row/id of its own).
 *
 * Payload's own validation (`required: true` on choice/rules subfields
 * etc.) and the calculation/conditional evaluators themselves are
 * Payload-level/application concerns, not this data layer's - these cases
 * only exercise what the database adapter itself has to get right: the
 * columns and child-table rows round-trip correctly.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete).
 */
describe('cms/db - forms (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteForm, not engine.delete: this suite's own writes should be
      // cleaned up by the same code under test.
      await deleteForm(id)
    }
  })

  it('reads a document written by Payload: a group-in-array (calculation) and an array-in-group-in-array (conditional.rules)', async () => {
    const title = `phase17-form-a-${Date.now()}`
    const created = await engine.create({
      collection: 'forms',
      data: {
        title,
        fields: [
          { type: 'text', name: 'guests', label: 'Number of guests' },
          {
            type: 'calculation',
            name: 'total',
            label: 'Total',
            calculation: { formula: '{guests} * 25', decimalPlaces: 2, prefix: '$' },
          },
          {
            type: 'text',
            name: 'notes',
            label: 'Notes',
            conditional: {
              enabled: true,
              action: 'show',
              match: 'all',
              rules: [{ field: 'guests', operator: 'greaterThan', value: '5' }],
            },
          },
        ],
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findFormByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.title).toBe(title)
    expect(viaOurs?.fields).toHaveLength(3)

    const [guestsField, totalField, notesField] = viaOurs!.fields!
    expect(guestsField.name).toBe('guests')

    expect(totalField.calculation?.formula).toBe('{guests} * 25')
    expect(totalField.calculation?.decimalPlaces).toBe(2)
    expect(totalField.calculation?.prefix).toBe('$')

    expect(notesField.conditional?.enabled).toBe(true)
    expect(notesField.conditional?.action).toBe('show')
    expect(notesField.conditional?.rules).toHaveLength(1)
    expect(notesField.conditional?.rules?.[0]).toMatchObject({ field: 'guests', operator: 'greaterThan', value: '5' })
  })

  it('writes a document (options array, calculation/pricing/conditional groups, conditional.rules) Payload can read back', async () => {
    const title = `phase17-form-b-${Date.now()}`
    const ours = await createForm({
      title,
      fields: [
        {
          type: 'select',
          name: 'room',
          label: 'Room',
          options: [
            { label: 'Standard', value: 'standard', price: 100 },
            { label: 'Deluxe', value: 'deluxe', price: 200 },
          ],
          pricing: { priced: true, unitPrice: 1 },
        },
        {
          type: 'text',
          name: 'promoCode',
          label: 'Promo code',
          conditional: {
            enabled: true,
            action: 'hide',
            match: 'any',
            rules: [
              { field: 'room', operator: 'equals', value: 'standard' },
              { field: 'guests', operator: 'isEmpty' },
            ],
          },
        },
      ],
    })
    createdIds.push(ours.id)

    expect(ours.fields?.[0].options?.map((o) => o.value)).toEqual(['standard', 'deluxe'])
    expect(ours.fields?.[0].pricing?.priced).toBe(true)
    expect(ours.fields?.[1].conditional?.rules?.map((r) => r.field)).toEqual(['room', 'guests'])

    const viaPayload = await engine.findByID({ collection: 'forms', id: ours.id, depth: 0 })
    const fields = viaPayload.fields as {
      options?: { value: string; price?: number }[]
      pricing?: { priced: boolean }
      conditional?: { rules?: { field: string; operator: string }[] }
    }[]
    expect(fields[0].options?.map((o) => o.value)).toEqual(['standard', 'deluxe'])
    expect(fields[0].options?.[1].price).toBe(200)
    expect(fields[0].pricing?.priced).toBe(true)
    expect(fields[1].conditional?.rules?.map((r) => r.operator)).toEqual(['equals', 'isEmpty'])
  })

  it('replaces fields wholesale on update, including the nested conditional.rules array', async () => {
    const title = `phase17-form-c-${Date.now()}`
    const created = await createForm({
      title,
      fields: [
        {
          type: 'text',
          name: 'email',
          conditional: { enabled: true, action: 'show', match: 'all', rules: [{ field: 'subscribe', operator: 'equals', value: 'yes' }] },
        },
      ],
    })
    createdIds.push(created.id)

    const updated = await updateForm(created.id, {
      fields: [
        {
          type: 'text',
          name: 'email',
          conditional: {
            enabled: true,
            action: 'show',
            match: 'any',
            rules: [
              { field: 'subscribe', operator: 'equals', value: 'yes' },
              { field: 'vip', operator: 'equals', value: 'true' },
            ],
          },
        },
      ],
    })
    expect(updated?.fields?.[0].conditional?.match).toBe('any')
    expect(updated?.fields?.[0].conditional?.rules).toHaveLength(2)

    const viaPayload = await engine.findByID({ collection: 'forms', id: created.id, depth: 0 })
    const fields = viaPayload.fields as { conditional?: { rules?: { field: string }[] } }[]
    expect(fields[0].conditional?.rules?.map((r) => r.field)).toEqual(['subscribe', 'vip'])
  })
})
