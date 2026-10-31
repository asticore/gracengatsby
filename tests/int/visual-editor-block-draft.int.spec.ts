// @vitest-environment node
// Visual editor local draft recovery: the pure rules (key, what may be kept, staleness, comparison).
import { describe, expect, it } from 'vitest'
import { blockDraftKey, comparableTree, draftNeedsOffer, holdsSensitiveData } from '@/views/visualEditor/blockDraft'
import type { SectionNode } from '@/lib/sectionTree'

const tree = (heading: string, extra: Record<string, unknown> = {}): SectionNode[] =>
  [{ blockType: 'heading', props: { text: heading }, _id: 'x1', ...extra } as unknown as SectionNode]

describe('blockDraftKey', () => {
  it('scopes a key to site, surface and document', () => {
    expect(blockDraftKey('pages', 7, 'https://shop.example/')).toBe('eg-ve-draft|https://shop.example|pages|7')
    expect(blockDraftKey('pages', 7, 'https://a.example')).not.toBe(blockDraftKey('pages', 8, 'https://a.example'))
  })
})

describe('comparableTree', () => {
  it('ignores editor ids', () => {
    expect(comparableTree(tree('Hi', { _id: 'a' }))).toBe(comparableTree(tree('Hi', { _id: 'b' })))
  })
  it('sees content changes', () => {
    expect(comparableTree(tree('Hi'))).not.toBe(comparableTree(tree('Bye')))
  })
})

describe('holdsSensitiveData', () => {
  it('flags secret-named keys and data: URLs at any depth', () => {
    expect(holdsSensitiveData(tree('Hi', { props: { nested: { apiKey: 'k' } } }))).toBe(true)
    expect(holdsSensitiveData([{ blockType: 'image', src: 'data:image/png;base64,AAAA' }])).toBe(true)
  })
  it('allows ordinary content', () => {
    expect(holdsSensitiveData(tree('Hello', { props: { level: 'h2', align: 'left' } }))).toBe(false)
  })
})

describe('draftNeedsOffer', () => {
  const server = tree('Server')
  it('offers a draft newer than the server with different content', () => {
    expect(draftNeedsOffer({ savedAt: '2026-10-31T10:05:00.000Z', blocks: tree('Mine') }, server, '2026-10-31T10:00:00.000Z')).toBe(true)
  })
  it('does not offer a draft older than the server copy', () => {
    expect(draftNeedsOffer({ savedAt: '2026-10-31T09:00:00.000Z', blocks: tree('Mine') }, server, '2026-10-31T10:00:00.000Z')).toBe(false)
  })
  it('does not offer a draft identical to the server copy', () => {
    expect(draftNeedsOffer({ savedAt: '2026-10-31T10:05:00.000Z', blocks: tree('Server') }, server, '2026-10-31T10:00:00.000Z')).toBe(false)
  })
})
