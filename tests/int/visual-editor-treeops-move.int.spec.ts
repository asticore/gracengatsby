import { describe, expect, it } from 'vitest'
import type { SectionNode } from '@/lib/sectionTree'
import { getList, getNode, moveNode, movedNodePath } from '@/views/visualEditor/treeOps'

const leaf = (id: string): SectionNode => ({ blockType: 'richText', _id: id }) as unknown as SectionNode
const section = (id: string, cols: SectionNode[][]): SectionNode =>
  ({
    blockType: 'section',
    _id: id,
    columns: cols.map((blocks, i) => ({ _id: `${id}-c${i}`, blocks })),
  }) as unknown as SectionNode
const ids = (list: SectionNode[] | undefined) => (list || []).map((n) => (n as { _id?: string })._id)

describe('treeOps moveNode', () => {
  const tree = () => [leaf('a'), section('s', [[leaf('x'), leaf('y')], [leaf('z')]]), leaf('b')]

  it('moves within one list with index adjustment', () => {
    expect(ids(moveNode(tree(), [0], [], 3))).toEqual(['s', 'b', 'a'])
    expect(ids(moveNode(tree(), [2], [], 0))).toEqual(['b', 'a', 's'])
    expect(movedNodePath(tree(), [0], [], 3)).toEqual([2])
  })

  it('treats dropping next to itself as a no-op', () => {
    const t = tree()
    expect(moveNode(t, [1], [], 1)).toBe(t)
    expect(moveNode(t, [1], [], 2)).toBe(t)
    expect(movedNodePath(t, [1], [], 2)).toBeNull()
  })

  it('moves into a column and shifts the container path when the source precedes it', () => {
    const next = moveNode(tree(), [0], [1, 1], 1)
    expect(ids(next)).toEqual(['s', 'b'])
    expect(ids(getList(next, [0, 1]))).toEqual(['z', 'a'])
    expect(movedNodePath(tree(), [0], [1, 1], 1)).toEqual([0, 1, 1])
  })

  it('moves out of a column and between columns', () => {
    const out = moveNode(tree(), [1, 0, 1], [], 0)
    expect(ids(out)).toEqual(['y', 'a', 's', 'b'])
    expect(ids(getList(out, [2, 0]))).toEqual(['x'])
    const across = moveNode(tree(), [1, 0, 0], [1, 1], 1)
    expect(ids(getList(across, [1, 0]))).toEqual(['y'])
    expect(ids(getList(across, [1, 1]))).toEqual(['z', 'x'])
  })

  it('reorders inside the same column', () => {
    const next = moveNode(tree(), [1, 0, 0], [1, 0], 2)
    expect(ids(getList(next, [1, 0]))).toEqual(['y', 'x'])
    expect(getNode(next, [1, 0, 1])).toBeDefined()
  })

  it('refuses dropping into itself or a descendant and bad targets', () => {
    const t = tree()
    expect(moveNode(t, [1], [1, 0], 0)).toBe(t)
    expect(moveNode(t, [1], [1, 1], 0)).toBe(t)
    expect(moveNode(t, [0], [5, 0], 0)).toBe(t)
    expect(moveNode(t, [9], [], 0)).toBe(t)
    expect(moveNode(t, [1, 0], [], 0)).toBe(t)
  })

  it('clamps an out-of-range index', () => {
    expect(ids(moveNode(tree(), [0], [], 99))).toEqual(['s', 'b', 'a'])
  })

  it('does not lose the node for a nested section moved into its sibling column', () => {
    const t = [section('outer', [[section('inner', [[leaf('q')]])], []])]
    const next = moveNode(t, [0, 0, 0], [0, 1], 0)
    expect(ids(getList(next, [0, 1]))).toEqual(['inner'])
    expect(ids(getList(next, [0, 0]))).toEqual([])
  })
})
