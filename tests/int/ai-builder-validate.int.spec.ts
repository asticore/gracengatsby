// @vitest-environment node
// Checks on the Build with AI reply: fences and prose, unknown types, design keys,
// unsafe links, script text, limits and fresh ids. No provider is contacted.
import { describe, expect, it } from 'vitest'

import { validateBuilderOutput, extractJson, isSafeUrl, BUILDER_LIMITS } from '@/features/ai/builderValidate'
import { workedExample } from '@/features/ai/builderGuide'
import type { SectionNode } from '@/lib/sectionTree'

const heading = (text: string, tag = 'h2') => ({ blockType: 'element', elementType: 'heading', props: { text, tag, align: 'left' } })
const section = (blocks: unknown[], design?: Record<string, unknown>) => ({
  blockType: 'section',
  ...(design ? { design } : {}),
  columns: [{ width: 12, blocks }],
})
const doc = (...sections: unknown[]) => ({ format: 'engage-template', schemaVersion: 1, kind: 'section', tree: sections })

const run = (text: unknown, mode: 'section' | 'page' | 'edit' = 'section') => validateBuilderOutput(text, { mode })

function firstBlock(sections: SectionNode[]): Record<string, unknown> {
  return sections[0].columns![0].blocks![0] as unknown as Record<string, unknown>
}

describe('reading the reply', () => {
  it('takes the JSON object out of a code fence and surrounding prose', () => {
    const reply = `Here is your section:\n\`\`\`json\n${JSON.stringify(doc(section([heading('Hello')])))}\n\`\`\`\nLet me know!`
    const result = run(reply)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sections).toHaveLength(1)
  })

  it('takes the JSON object out of bare prose', () => {
    const result = run(`Sure. ${JSON.stringify(doc(section([heading('Hi')])))} Done.`)
    expect(result.ok).toBe(true)
  })

  it('accepts a bare array of sections', () => {
    const result = run(JSON.stringify([section([heading('Bare')])]))
    expect(result.ok).toBe(true)
  })

  it('rejects a reply with no JSON', () => {
    const result = run('I cannot help with that.')
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects another document format', () => {
    const result = run(JSON.stringify({ format: 'something-else', tree: [section([heading('x')])] }))
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects an empty reply and an empty tree', () => {
    expect(run('')).toMatchObject({ ok: false })
    expect(run(JSON.stringify(doc()))).toMatchObject({ ok: false })
  })

  it('extractJson returns undefined for prose only', () => {
    expect(extractJson('nothing here')).toBeUndefined()
  })
})

describe('element and design checks', () => {
  it('drops an unknown element type and keeps its neighbours, with a warning', () => {
    const result = run(
      JSON.stringify(
        doc(section([heading('Keep me'), { blockType: 'element', elementType: 'made-up-widget', props: {} }, heading('Keep me too')])),
      ),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const blocks = result.sections[0].columns![0].blocks!
    expect(blocks.map((b) => (b as { elementType?: string }).elementType)).toEqual(['heading', 'heading'])
    expect(result.warnings.join(' ')).toMatch(/not use|removed/)
  })

  it('drops a block type the builder does not use', () => {
    const result = run(JSON.stringify(doc(section([{ blockType: 'productGrid', props: {} }, heading('ok')]))))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sections[0].columns![0].blocks).toHaveLength(1)
  })

  it('drops design keys the builder cannot set and bad values, with warnings', () => {
    const result = run(
      JSON.stringify(
        doc(
          section([heading('Styled')], {
            bgType: 'color',
            bgColor: '#111827',
            customCss: 'body{display:none}',
            bgImage: 42,
            textAlign: 'sideways',
            notAKey: true,
          }),
        ),
      ),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const design = result.sections[0].design as Record<string, unknown>
    expect(design.bgColor).toBe('#111827')
    expect(design.customCss).toBeUndefined()
    expect(design.bgImage).toBeUndefined()
    expect(design.textAlign).toBeUndefined()
    expect(design.notAKey).toBeUndefined()
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('clamps numeric design values to their range', () => {
    const result = run(JSON.stringify(doc(section([heading('Big')], { paddingTop: 99999, fontSize: 9999, bgOverlay: -5 }))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const design = result.sections[0].design as Record<string, number>
    expect(design.paddingTop).toBe(400)
    expect(design.fontSize).toBe(400)
    expect(design.bgOverlay).toBe(0)
  })

  it('drops an unsafe colour value', () => {
    const result = run(JSON.stringify(doc(section([heading('Colour')], { bgColor: 'red;background:url(x)' }))))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sections[0].design).toBeUndefined()
  })

  it('drops a select prop that is not one of its options', () => {
    const result = run(JSON.stringify(doc(section([heading('Tagged', 'h9')]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((firstBlock(result.sections).props as Record<string, unknown>).tag).toBeUndefined()
    expect((firstBlock(result.sections).props as Record<string, unknown>).text).toBe('Tagged')
  })

  it('drops prop keys the element does not have', () => {
    const result = run(JSON.stringify(doc(section([{ blockType: 'element', elementType: 'heading', props: { text: 'Hi', onclick: 'x' } }]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((firstBlock(result.sections).props as Record<string, unknown>).onclick).toBeUndefined()
  })
})

describe('links and script text', () => {
  it('rejects javascript: and data: links and keeps safe ones', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,<script>')).toBe(false)
    expect(isSafeUrl('//evil.example')).toBe(false)
    expect(isSafeUrl('/shop')).toBe(true)
    expect(isSafeUrl('https://example.com/x')).toBe(true)
  })

  it('removes a javascript: button link and reports it', () => {
    const button = { blockType: 'element', elementType: 'button', props: { text: 'Go', url: 'javascript:alert(1)', variant: 'primary' } }
    const result = run(JSON.stringify(doc(section([button]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((firstBlock(result.sections).props as Record<string, unknown>).url).toBeUndefined()
    expect(result.warnings.join(' ')).toMatch(/link that is not allowed/)
  })

  it('keeps a safe button link', () => {
    const button = { blockType: 'element', elementType: 'button', props: { text: 'Shop', url: '/shop', variant: 'primary' } }
    const result = run(JSON.stringify(doc(section([button]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((firstBlock(result.sections).props as Record<string, unknown>).url).toBe('/shop')
  })

  it('strips script tags and markup from text', () => {
    const result = run(JSON.stringify(doc(section([heading('Hello <script>alert(1)</script><b>world</b>')]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = (firstBlock(result.sections).props as Record<string, unknown>).text as string
    expect(text).toBe('Hello world')
  })

  it('turns a plain rich text string into editor paragraphs', () => {
    const block = { blockType: 'element', elementType: 'text-editor', props: { content: 'Small batches.' } }
    const result = run(JSON.stringify(doc(section([block]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const content = (firstBlock(result.sections).props as Record<string, { root: { type: string } }>).content
    expect(content.root.type).toBe('root')
  })

  it('leaves out picture and record fields the model should not set', () => {
    const image = { blockType: 'element', elementType: 'image', props: { image: 42, alt: 'A candle' } }
    const result = run(JSON.stringify(doc(section([image]))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const props = firstBlock(result.sections).props as Record<string, unknown>
    expect(props.image).toBeUndefined()
  })
})

describe('limits and ids', () => {
  it('rejects more than the node cap', () => {
    const blocks = Array.from({ length: BUILDER_LIMITS.maxNodes }, (_, i) => heading(`Line ${i}`))
    const sections = [section(blocks.slice(0, 150)), section(blocks.slice(150)), section([heading('extra')])]
    const result = run(JSON.stringify(doc(...sections)), 'page')
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects more sections than the page limit', () => {
    const sections = Array.from({ length: BUILDER_LIMITS.maxSections + 1 }, (_, i) => section([heading(`S${i}`)]))
    expect(run(JSON.stringify(doc(...sections)), 'page')).toMatchObject({ ok: false })
  })

  it('limits a section request to a few sections', () => {
    const sections = Array.from({ length: 6 }, (_, i) => section([heading(`S${i}`)]))
    expect(run(JSON.stringify(doc(...sections)), 'section')).toMatchObject({ ok: false })
    const page = run(JSON.stringify(doc(...sections)), 'page')
    expect(page.ok).toBe(true)
  })

  it('rejects a reply over the character cap', () => {
    const big = 'x'.repeat(BUILDER_LIMITS.maxReplyChars + 1)
    expect(run(big)).toMatchObject({ ok: false })
  })

  it('gives every node a fresh id', () => {
    const input = doc({ blockType: 'section', _id: 'old-1', columns: [{ _id: 'old-2', width: 12, blocks: [{ ...heading('Id'), _id: 'old-3' }] }] })
    const result = run(JSON.stringify(input))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sectionId = result.sections[0]._id
    const column = result.sections[0].columns![0] as { _id?: string; blocks: Array<{ _id?: string }> }
    expect(sectionId).toBeTruthy()
    expect(sectionId).not.toBe('old-1')
    expect(column._id).not.toBe('old-2')
    expect(column.blocks[0]._id).not.toBe('old-3')
    expect(column.blocks[0]._id).toBeTruthy()
  })
})

describe('the worked example from the guide', () => {
  it('passes with no warnings', () => {
    const result = run(workedExample())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings).toEqual([])
  })
})
