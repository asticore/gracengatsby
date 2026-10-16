import { beforeEach, describe, expect, it } from 'vitest'
import type { SectionNode } from '@/lib/sectionTree'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  clampPath,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type Snapshot,
} from '@/views/visualEditor/history'
import {
  parseClipboardText,
  planPaste,
  readClipboard,
  resetClipboardMemory,
  serializeSelection,
  writeClipboard,
} from '@/views/visualEditor/editorClipboard'
import { isEditableTarget, resolveShortcut } from '@/views/visualEditor/useEditorShortcuts'

const k = (key: string, o: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key,
  ctrl: false,
  meta: false,
  shift: false,
  alt: false,
  ...o,
})

const snap = (n: number): Snapshot => ({ blocks: [{ blockType: 'section', n } as unknown as SectionNode], selectedPath: null })

describe('history', () => {
  it('undoes and redoes, clearing redo on a new edit', () => {
    let h = pushHistory(createHistory(), snap(1), { now: 0 })
    h = pushHistory(h, snap(2), { now: 10 })
    const back = undoHistory(h, snap(3))!
    expect(back.snapshot).toEqual(snap(2))
    expect(canRedo(back.history)).toBe(true)
    const fwd = redoHistory(back.history, snap(2))!
    expect(fwd.snapshot).toEqual(snap(3))
    const fresh = pushHistory(back.history, snap(2), { now: 20 })
    expect(canRedo(fresh)).toBe(false)
    expect(canUndo(createHistory())).toBe(false)
    expect(undoHistory(createHistory(), snap(0))).toBeNull()
  })

  it('merges same-key pushes within 800ms only', () => {
    let h = pushHistory(createHistory(), snap(1), { key: 'edit:0', now: 1000 })
    h = pushHistory(h, snap(2), { key: 'edit:0', now: 1500 })
    expect(h.past).toHaveLength(1)
    h = pushHistory(h, snap(3), { key: 'edit:1', now: 1600 })
    expect(h.past).toHaveLength(2)
    h = pushHistory(h, snap(4), { key: 'edit:1', now: 3000 })
    expect(h.past).toHaveLength(3)
  })

  it('caps at 100 entries', () => {
    let h = createHistory()
    for (let i = 0; i < 150; i += 1) h = pushHistory(h, snap(i), { now: i * 1000 })
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect((h.past[0].blocks[0] as unknown as { n: number }).n).toBe(50)
  })

  it('clamps selection to what still exists', () => {
    const tree = [
      { blockType: 'section', columns: [{ blocks: [{ blockType: 'text' }] }] },
      { blockType: 'text' },
    ] as unknown as SectionNode[]
    expect(clampPath(tree, [1])).toEqual([1])
    expect(clampPath(tree, [5])).toEqual([1])
    expect(clampPath(tree, [0, 0, 4])).toEqual([0, 0, 0])
    expect(clampPath(tree, [0, 3, 0])).toEqual([0])
    expect(clampPath([], [0])).toBeNull()
    expect(clampPath(tree, null)).toBeNull()
  })
})

describe('clipboard', () => {
  beforeEach(() => resetClipboardMemory())

  const tree = [
    {
      _id: 'a',
      blockType: 'section',
      columns: [{ _id: 'c', blocks: [{ _id: 'b', blockType: 'richText' }] }],
    },
    { _id: 'z', blockType: 'richText' },
  ] as unknown as SectionNode[]

  it('serialises without editor ids and round-trips', () => {
    const out = serializeSelection(tree, [0])!
    expect(out.kind).toBe('section')
    expect(out.text).not.toContain('"_id"')
    const parsed = parseClipboardText(out.text)
    expect(parsed.ok).toBe(true)
    expect(serializeSelection(tree, [1])!.kind).toBe('block')
    expect(serializeSelection(tree, [0, 0])!.kind).toBe('block')
    expect(serializeSelection(tree, null)).toBeNull()
  })

  it('rejects foreign, malformed and unsafe content', () => {
    const wrap = (tree: unknown, extra: Record<string, unknown> = {}) =>
      JSON.stringify({ format: 'engage-template', schemaVersion: 1, kind: 'block', tree, ...extra })
    expect(parseClipboardText('hello').ok).toBe(false)
    expect(parseClipboardText('{"a":1}').ok).toBe(false)
    expect(parseClipboardText(wrap([{ blockType: 'richText' }], { schemaVersion: 2 })).ok).toBe(false)
    expect(parseClipboardText(wrap([{ blockType: 'richText' }], { kind: 'page' })).ok).toBe(false)
    expect(parseClipboardText(wrap([{ blockType: 'nopeNotABlock' }])).ok).toBe(false)
    expect(parseClipboardText(wrap([{ blockType: 'richText', text: '<script>x</script>' }])).ok).toBe(false)
    expect(parseClipboardText(wrap([{ blockType: 'rawHtml' }])).ok).toBe(false)
    expect(parseClipboardText(wrap([{ blockType: 'element', elementType: 'nope' }])).ok).toBe(false)
    expect(parseClipboardText(wrap([])).ok).toBe(false)
    expect(parseClipboardText(null).ok).toBe(false)
    let deep: unknown = { blockType: 'richText' }
    for (let i = 0; i < 12; i += 1) deep = { blockType: 'section', columns: [{ blocks: [deep] }] }
    expect(parseClipboardText(wrap([deep])).ok).toBe(false)
  })

  it('plans where a paste lands', () => {
    expect(planPaste(tree, null)).toEqual({ containerPath: [], at: 2 })
    expect(planPaste(tree, [0])).toEqual({ containerPath: [], at: 1 })
    expect(planPaste(tree, [0, 0, 0])).toEqual({ containerPath: [0, 0], at: 1 })
    expect(planPaste(tree, [0, 0])).toEqual({ containerPath: [0, 0], at: 1 })
    expect(planPaste(tree, [9])).toEqual({ containerPath: [], at: 2 })
  })

  it('falls back to memory when the system clipboard is unavailable', async () => {
    const text = serializeSelection(tree, [1])!.text
    expect(await writeClipboard(text)).toBe('memory')
    const read = await readClipboard()
    expect(read.ok).toBe(true)
  })
})

describe('shortcuts', () => {
  it('maps keys to actions', () => {
    expect(resolveShortcut(k('z', { ctrl: true }))).toBe('undo')
    expect(resolveShortcut(k('Z', { meta: true, shift: true }))).toBe('redo')
    expect(resolveShortcut(k('y', { ctrl: true }))).toBe('redo')
    expect(resolveShortcut(k('c', { ctrl: true }))).toBe('copy')
    expect(resolveShortcut(k('x', { meta: true }))).toBe('cut')
    expect(resolveShortcut(k('v', { ctrl: true }))).toBe('paste')
    expect(resolveShortcut(k('d', { ctrl: true }))).toBe('duplicate')
    expect(resolveShortcut(k('Delete'))).toBe('delete')
    expect(resolveShortcut(k('Backspace'))).toBe('delete')
    expect(resolveShortcut(k('Escape'))).toBe('clear')
    expect(resolveShortcut(k('ArrowUp', { alt: true }))).toBe('moveUp')
    expect(resolveShortcut(k('ArrowDown', { alt: true }))).toBe('moveDown')
    expect(resolveShortcut(k('a'))).toBeNull()
    expect(resolveShortcut(k('Delete', { ctrl: true }))).toBeNull()
    expect(resolveShortcut(k('c', { ctrl: true, shift: true }))).toBeNull()
  })

  it('treats form fields as editable', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
