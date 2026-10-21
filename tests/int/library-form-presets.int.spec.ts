import { describe, expect, it, vi } from 'vitest'

import { FORM_PRESETS } from '@/views/visualEditor/formPresets'
import { createFormFromPreset, filterFormPresetCards, formPresetCards, formPresetNode } from '@/views/visualEditor/libraryFormPresets'

describe('library form presets', () => {
  it('lists one card per preset', () => {
    expect(formPresetCards().map((c) => c.id)).toEqual(FORM_PRESETS.map((p) => p.id))
  })

  it('builds a form block with the preset fields pre-filled', () => {
    for (const preset of FORM_PRESETS) {
      const node = formPresetNode(preset.id)
      expect(node?.blockType).toBe('form')
      expect(node?.preset).toBe(preset.id)
      expect(node?.fields).toEqual(preset.fields)
      expect(node?.settings).toEqual(preset.settings)
    }
  })

  it('deep-copies fields so edits do not leak into the preset', () => {
    const node = formPresetNode('contact')!
    ;(node.fields as { props: { label: string } }[])[0].props.label = 'changed'
    expect(FORM_PRESETS.find((p) => p.id === 'contact')!.fields[0].props?.label).toBe('Name')
  })

  it('returns null for an unknown id', () => {
    expect(formPresetNode('nope')).toBeNull()
  })

  it('filters by label, description and group name', () => {
    const cards = formPresetCards()
    expect(filterFormPresetCards(cards, '')).toHaveLength(cards.length)
    expect(filterFormPresetCards(cards, 'forms')).toHaveLength(cards.length)
    expect(filterFormPresetCards(cards, 'newsletter').map((c) => c.id)).toEqual(['newsletter-signup'])
    expect(filterFormPresetCards(cards, 'zzz')).toEqual([])
  })

  describe('createFormFromPreset', () => {
    const ok = (body: unknown, status = 201) => ({ ok: status < 400, status, json: async () => body }) as Response

    it('POSTs the preset as a saved form and returns a form block pointing at it', async () => {
      const preset = FORM_PRESETS.find((p) => p.id === 'contact')!
      const fetchImpl = vi.fn(async () => ok({ doc: { id: 42 } }))
      const result = await createFormFromPreset('contact', fetchImpl as unknown as typeof fetch)
      expect(result).toEqual({ ok: true, node: { blockType: 'form', form: 42, showTitle: true } })
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/forms')
      expect(init.method).toBe('POST')
      const body = JSON.parse(String(init.body))
      expect(body.title).toBe(preset.label)
      expect(body.layout).toEqual(preset.fields)
      expect(body.publishedLayout).toEqual(preset.fields)
      expect(body.formStatus).toBe('published')
      expect(body.settings).toEqual(preset.settings)
    })

    it('inserts nothing when the server refuses', async () => {
      const result = await createFormFromPreset('contact', (async () => ok({}, 403)) as unknown as typeof fetch)
      expect(result.ok).toBe(false)
    })

    it('inserts nothing when the response has no id or fetch throws', async () => {
      expect((await createFormFromPreset('contact', (async () => ok({ doc: {} })) as unknown as typeof fetch)).ok).toBe(false)
      const boom = (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch
      expect((await createFormFromPreset('contact', boom)).ok).toBe(false)
    })

    it('does not call the server for an unknown preset', async () => {
      const fetchImpl = vi.fn()
      const result = await createFormFromPreset('nope', fetchImpl as unknown as typeof fetch)
      expect(result.ok).toBe(false)
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })
})
