// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createFormSubmission, deleteFormSubmission, findFormSubmissionByID, updateFormSubmission } from '@/cms/db'

/**
 * Form submissions - scalar-only (this app's first real use of Payload's
 * `json` field type in this data layer: `values`/`lineItems`) plus one
 * single-target relationship (`form` -> forms, a plain FK column; Forms
 * itself is not modeled in this data layer yet, same reasoning Phase 13
 * already established for Enrolments/LessonProgress's `user` column pointing
 * at Users before Users was modeled), so createCollectionOps(formSubmissions,
 * FormSubmissions) needs no extra options.
 *
 * `form` is `required: true` on the Payload field (and the generated column
 * is `NOT NULL`), so - the same way Phase 13 created a real `users` row as a
 * valid FK target for Enrolments/LessonProgress before Users was modeled -
 * this suite creates one real `forms` row through Payload's own Local API to
 * use as the FK target, rather than leaving `form` unset.
 *
 * FormSubmissions' Payload `access.create` is `() => false` - nobody, not
 * even admins, can create a submission through Payload's normal (HTTP/admin)
 * API; entries only ever arrive via the feature's own submit endpoint, which
 * writes with `overrideAccess`. Payload's Local API (`engine.create()`, used
 * below) overrides access control by default, so the usual write-both-ways
 * parity pattern still applies unchanged.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete) because sibling suites
 * exercise the translations/memberships/ab-tests collections against the
 * same local D1 database concurrently.
 */
describe('cms/db - form-submissions (proof of concept, not wired in)', () => {
  let engine: Engine
  let formId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    const form = await engine.create({
      collection: 'forms',
      data: {
        title: `Phase 16 form ${Date.now()}`,
        fields: [{ type: 'text', name: 'name', label: 'Name' }],
      },
    })
    formId = form.id as number
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteFormSubmission, not engine.delete: this suite's own writes
      // should be cleaned up by the same code under test.
      await deleteFormSubmission(id)
    }
    await engine.delete({ collection: 'forms', id: formId })
  })

  it('reads a document written by Payload, with values as a real object and an unset nullable field', async () => {
    const summary = `phase16-form-submission-a-${Date.now()}`
    const created = await engine.create({
      collection: 'form-submissions',
      data: {
        form: formId,
        values: { name: 'Test Person', message: 'hello' },
        summary,
        paymentStatus: 'none',
        // notificationStatus deliberately left unset.
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findFormSubmissionByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.form).toBe(formId)
    expect(viaOurs?.summary).toBe(summary)
    expect(viaOurs?.paymentStatus).toBe('none')
    expect(viaOurs?.notificationStatus == null).toBe(true)
    expect(viaOurs?.values).toEqual({ name: 'Test Person', message: 'hello' })
  })

  it('writes a document Payload can read back, with values and lineItems as real objects/arrays', async () => {
    const summary = `phase16-form-submission-b-${Date.now()}`
    const lineItems = [{ label: 'Base price', amount: 100 }]
    const ours = await createFormSubmission({
      form: formId,
      values: { plan: 'pro', seats: 3 },
      summary,
      lineItems,
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'form-submissions', id: ours.id })
    expect(viaPayload.summary).toBe(summary)
    expect(viaPayload.values).toEqual({ plan: 'pro', seats: 3 })
    expect(viaPayload.lineItems).toEqual(lineItems)
  })

  it('updates through the clone adapter and the change round-trips through Payload', async () => {
    const summary = `phase16-form-submission-c-${Date.now()}`
    const ours = await createFormSubmission({
      form: formId,
      values: { plan: 'basic' },
      summary,
      paymentStatus: 'unpaid',
    })
    createdIds.push(ours.id)

    const updated = await updateFormSubmission(ours.id, { paymentStatus: 'paid', notificationStatus: 'sent' })
    expect(updated?.paymentStatus).toBe('paid')
    expect(updated?.notificationStatus).toBe('sent')

    const viaPayload = await engine.findByID({ collection: 'form-submissions', id: ours.id })
    expect(viaPayload.paymentStatus).toBe('paid')
    expect(viaPayload.notificationStatus).toBe('sent')
    expect(viaPayload.summary).toBe(summary)
  })
})
