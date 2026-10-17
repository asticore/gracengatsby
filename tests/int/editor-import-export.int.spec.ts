import { describe, expect, it } from 'vitest'
import type { SectionNode } from '@/lib/sectionTree'
import {
  CLIPBOARD_FORMAT,
  countNodes,
  exportPage,
  parseClipboardText,
  parsePageImport,
  slugifyFileName,
  withFreshIds,
} from '@/views/visualEditor/editorClipboard'
import { stripEditorIds } from '@/views/visualEditor/treeOps'

const page = [
  {
    blockType: 'section',
    _id: 'sec-1',
    columns: [
      { _id: 'col-1', blocks: [{ blockType: 'element', elementType: 'heading', props: { text: 'Hi' }, _id: 'el-1' }] },
      { _id: 'col-2', blocks: [{ blockType: 'richText', _id: 'rt-1' }] },
    ],
  },
  { blockType: 'hero', heading: 'Welcome', _id: 'hero-1' },
] as unknown as SectionNode[]

const fileOf = (tree: unknown, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ format: CLIPBOARD_FORMAT, schemaVersion: 1, kind: 'page', tree, ...overrides })

describe('page export', () => {
  it('writes one engage-template page document with no editor ids', () => {
    const { text, count, sections } = exportPage(page)
    const data = JSON.parse(text)
    expect(data.format).toBe('engage-template')
    expect(data.schemaVersion).toBe(1)
    expect(data.kind).toBe('page')
    expect(data.tree).toHaveLength(2)
    expect(text).not.toContain('"_id"')
    expect(count).toBe(4)
    expect(sections).toBe(1)
  })

  it('round trips: export then import gives back the same blocks', () => {
    const { text } = exportPage(page)
    const result = parsePageImport(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.nodes).toEqual(stripEditorIds(page))
    expect(result.summary.elementCount).toBe(4)
    expect(result.summary.sections).toBe(1)
    expect(result.summary.unknownTypes).toEqual([])
  })

})

describe('fresh ids on import', () => {
  it('replaces ids carried in the file so they never collide with the editor', () => {
    const result = parsePageImport(fileOf(page))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    let n = 0
    const fresh = withFreshIds(result.summary.nodes, () => `new-${++n}`)
    const ids: string[] = []
    const collect = (nodes: SectionNode[]) => {
      for (const node of nodes) {
        ids.push(String((node as { _id?: string })._id))
        for (const column of (node.columns as { _id?: string; blocks?: SectionNode[] }[] | undefined) ?? []) {
          ids.push(String(column._id))
          collect(column.blocks ?? [])
        }
      }
    }
    collect(fresh)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(countNodes(fresh) + 2)
    for (const oldId of ['sec-1', 'col-1', 'col-2', 'el-1', 'rt-1', 'hero-1']) expect(ids).not.toContain(oldId)
  })
})

describe('unknown types', () => {
  it('keeps unknown block and element types and flags them', () => {
    const tree = [
      ...(page as unknown[]),
      { blockType: 'widget-zz', foo: 1 },
      { blockType: 'element', elementType: 'no-such-element', props: {} },
    ]
    const result = parsePageImport(fileOf(tree))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.unknownTypes).toEqual(['block:widget-zz', 'element:no-such-element'])
    expect(result.summary.nodes).toHaveLength(4)
    expect(result.summary.nodes[2]).toMatchObject({ blockType: 'widget-zz', foo: 1 })
    expect(result.summary.nodes[3]).toMatchObject({ blockType: 'element', elementType: 'no-such-element' })
  })

  it('paste still refuses an unknown block type', () => {
    const text = JSON.stringify({ format: CLIPBOARD_FORMAT, schemaVersion: 1, kind: 'page', tree: [{ blockType: 'widget-zz' }] })
    expect(parseClipboardText(text).ok).toBe(false)
  })
})

describe('refusals', () => {
  it('refuses a newer schemaVersion', () => {
    const result = parsePageImport(fileOf(page, { schemaVersion: 2 }))
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining('schemaVersion 2') }))
  })

  it('refuses another format', () => {
    const result = parsePageImport(fileOf(page, { format: 'engage-style' }))
    expect(result.ok).toBe(false)
  })

  it('refuses invalid JSON and empty input', () => {
    expect(parsePageImport('{not json').ok).toBe(false)
    expect(parsePageImport('   ').ok).toBe(false)
  })

  it('refuses script content', () => {
    const tree = [{ blockType: 'hero', heading: '<script>alert(1)</script>' }]
    expect(parsePageImport(fileOf(tree)).ok).toBe(false)
  })

  it('refuses a file with no blocks', () => {
    expect(parsePageImport(fileOf([])).ok).toBe(false)
  })
})

describe('file names', () => {
  it('slugifies titles to ASCII file stems', () => {
    expect(slugifyFileName('Caf\u00e9 Page: Spring & Summer!')).toBe('cafe-page-spring-summer')
    expect(slugifyFileName('!!!')).toBe('page')
  })
})
