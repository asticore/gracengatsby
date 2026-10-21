import { describe, expect, it } from 'vitest'

import { buildTemplateExport, validateTemplateImport } from '@/features/siteTemplates/templateIo'
import { STARTERS } from '@/features/siteTemplates/starters'

const starter = STARTERS[0]
const doc = { name: 'My post', kind: starter.kind, priority: 20, conditions: [] as unknown[], blocks: starter.blocks() }

describe('template io', () => {
  it('round trips', () => {
    const out = buildTemplateExport({ ...doc, id: 5 } as never)
    expect(out.format).toBe('engage-template')
    expect(JSON.stringify(out)).not.toContain('"id"')
    const res = validateTemplateImport(JSON.stringify(out))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.template.kind).toBe(starter.kind)
      expect(res.template.priority).toBe(20)
      expect(res.template.blocks).toHaveLength(doc.blocks.length)
    }
  })
  it('rejects bad kind', () => {
    const out = { ...buildTemplateExport(doc), kind: 'nope' }
    expect(validateTemplateImport(out)).toMatchObject({ ok: false, error: expect.stringContaining('kind') })
  })
  it('rejects oversize', () => {
    const out = { ...buildTemplateExport(doc), title: 'x'.repeat(600 * 1024) }
    expect(validateTemplateImport(JSON.stringify(out))).toMatchObject({ ok: false })
  })
  it('rejects unknown element types', () => {
    const out = buildTemplateExport(doc)
    const bad = JSON.parse(JSON.stringify(out))
    bad.blocks[0].columns[0].blocks[0].elementType = 'does-not-exist'
    expect(validateTemplateImport(bad)).toMatchObject({ ok: false, error: expect.stringContaining('does-not-exist') })
  })
  it('keeps script strings as data and strips secrets', () => {
    const out = buildTemplateExport(doc)
    const copy = JSON.parse(JSON.stringify(out))
    const node = copy.blocks[0].columns[0].blocks[0]
    node.props = { ...node.props, text: '<script>alert(1)</script>', apiKey: 'abc' }
    const res = validateTemplateImport(copy)
    expect(res.ok).toBe(true)
    if (res.ok) {
      const p = (res.template.blocks[0].columns?.[0].blocks[0] as unknown as { props: Record<string, unknown> }).props
      expect(p.text).toBe('<script>alert(1)</script>')
      expect(p.apiKey).toBeUndefined()
    }
  })
})
