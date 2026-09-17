// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { createFormSubmission, findFormSubmissionByID } from '@/cms/db'

/**
 * FormSubmissions: like EventRsvps (a `relation`), but uses `hasMany` (1:N
 * relationship) instead of `rel` (N:N relationship).
 */
describe('cms/db - form-submissions (hasMany relationship)', () => {
  let engine: Engine

  it('reads a document written by Payload: relation field (hasMany)', async () => {
    engine = await getEngine()
    const formRef = await engine.create({ collection: 'forms', data: { name: 'Test Form' } })

    const created = await engine.create({
      collection: 'form-submissions',
      data: { form: formRef.id, data: 'test data' },
    })

    const viaOurs = await findFormSubmissionByID(created.id as number)
    expect(viaOurs?.id).toBe(created.id)
    expect(viaOurs?.data).toBe('test data')
  })

  it('writes a document Payload can read back', async () => {
    const formRef = await engine.create({ collection: 'forms', data: { name: 'Test Form' } })
    const ours = await createFormSubmission({ form: formRef.id as number, data: 'our submission' })
    expect(ours.id).toBeDefined()

    const viaPayload = await engine.findByID({ collection: 'form-submissions', id: ours.id, depth: 0 })
    expect(viaPayload.data).toBe('our submission')
  })
})
