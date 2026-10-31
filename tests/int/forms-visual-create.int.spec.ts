import { describe, expect, it } from 'vitest'
import { createBlankForm, formEditorPath } from '@/views/visualEditor/formRelation'

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('createBlankForm (Form element: New form)', () => {
  it('posts an empty draft to /api/forms and returns the new id', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return jsonResponse(201, { doc: { id: 42, title: 'New form' } })
    }) as typeof fetch

    const result = await createBlankForm('New form', fetchImpl)

    expect(result).toEqual({ ok: true, id: 42 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/forms')
    expect(calls[0].init?.method).toBe('POST')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toEqual({ title: 'New form', layout: [], formStatus: 'draft' })
  })

  it('never reports success without a confirmed id', async () => {
    const fetchImpl = (async () => jsonResponse(201, {})) as typeof fetch
    const result = await createBlankForm('New form', fetchImpl)
    expect(result.ok).toBe(false)
  })

  it('reports a server refusal with its status and does not return an id', async () => {
    const fetchImpl = (async () => jsonResponse(403, { error: 'Forbidden' })) as typeof fetch
    const result = await createBlankForm('New form', fetchImpl)
    expect(result).toEqual({ ok: false, error: 'The form could not be created (403).' })
  })

  it('reports a network failure without throwing', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('network down')
    }) as unknown as typeof fetch
    const result = await createBlankForm('New form', fetchImpl)
    expect(result.ok).toBe(false)
  })
})

describe('formEditorPath', () => {
  it('points at the visual editor for that form document', () => {
    expect(formEditorPath(7)).toBe('/visual-editor/collection/forms/7')
    expect(formEditorPath('abc')).toBe('/visual-editor/collection/forms/abc')
  })
})
