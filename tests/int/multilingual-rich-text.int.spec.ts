// @vitest-environment node
// Rich text at the text-node level: extraction, round trip through the overlay,
// formatting and links kept, code skipped, fallback, and stale/inactive handling
// when blocks move. Pure - no engine.
import { describe, expect, it } from 'vitest'

import { overlayDocument } from '@/features/multilingual/overlay'
import { extractRichTextNodes, readRichTextNode, writeRichTextNode } from '@/features/multilingual/richText'
import { sourceTextOf, valueAtPath } from '@/features/multilingual/store'
import { classifyTranslation, type LiveDocument } from '@/features/multilingual/documentRows'
import { fieldsForDocument } from '@/features/multilingual/translatableFields'
import type { TranslationRow } from '@/features/multilingual/store'

const text = (value: string, format = 0) => ({ type: 'text', text: value, format, detail: 0, mode: 'normal', style: '', version: 1 })
const para = (...children: unknown[]) => ({ type: 'paragraph', children, direction: 'ltr', format: '', indent: 0, version: 1 })
const heading = (...children: unknown[]) => ({ type: 'heading', tag: 'h2', children, version: 1 })
const link = (url: string, ...children: unknown[]) => ({ type: 'link', url, children, version: 1 })
const code = (...children: unknown[]) => ({ type: 'code', language: 'js', children, version: 1 })

/** A Lexical document: heading, a paragraph with bold and a link, and a code block. */
const tree = () => ({
  root: {
    type: 'root',
    version: 1,
    children: [
      heading(text('Welcome')),
      para(text('Hello '), text('bold', 1), text(' and '), link('https://example.com/x', text('the site'))),
      code(text('const a = 1')),
    ],
  },
})

const faq = (answer: unknown) => ({ id: 3, question: 'What?', answer, category: 'General' })

describe('extractRichTextNodes', () => {
  it('addresses each visible text node, skipping code and blank text', () => {
    const nodes = extractRichTextNodes(tree())
    expect(nodes.map((n) => n.text)).toEqual(['Welcome', 'Hello ', 'bold', ' and ', 'the site'])
    expect(nodes.map((n) => n.indexPath)).toEqual([[0, 0], [1, 0], [1, 1], [1, 2], [1, 3, 0]])
    expect(nodes.map((n) => n.blockType)).toEqual(['heading', 'paragraph', 'paragraph', 'paragraph', 'paragraph'])
  })

  it('never addresses inline code formatting', () => {
    const doc = { root: { type: 'root', children: [para(text('keep'), text('const x', 16))] } }
    expect(extractRichTextNodes(doc).map((n) => n.text)).toEqual(['keep'])
  })
})

describe('round trip through the overlay', () => {
  it('replaces each text node and keeps structure, formatting, link URL and code untouched', () => {
    const source = faq(tree())
    const translations = new Map<string, string>([
      ['faqs:3|answer#0.0', 'Bienvenue'],
      ['faqs:3|answer#1.1', 'gras'],
    ])
    const overlaid = overlayDocument(
      source,
      'faqs',
      3,
      (sourceId, fieldPath) => translations.get(`${sourceId}|${fieldPath}`) ?? null,
      true,
    )
    const out = overlaid.answer as ReturnType<typeof tree>
    const nodes = out.root.children
    expect((nodes[0] as { children: { text: string }[] }).children[0].text).toBe('Bienvenue')
    const bold = (nodes[1] as { children: { text: string; format: number }[] }).children[1]
    expect(bold.text).toBe('gras')
    expect(bold.format).toBe(1)
    // Untouched: the link URL, the link's text (no translation), the code block.
    expect((nodes[1] as { children: { url: string }[] }).children[3].url).toBe('https://example.com/x')
    expect((nodes[2] as { children: { text: string }[] }).children[0].text).toBe('const a = 1')
    // Source is not mutated.
    expect((source.answer as ReturnType<typeof tree>).root.children[0]).toEqual(tree().root.children[0])
  })

  it('falls back to the source text for a node with no publishable translation', () => {
    const overlaid = overlayDocument(faq(tree()), 'faqs', 3, () => null, true)
    expect(sourceTextOf(overlaid.answer)).toBe(sourceTextOf(tree()))
  })

  it('keeps a string-stored tree a string', () => {
    const stored = JSON.stringify(tree())
    const written = writeRichTextNode(stored, [0, 0], 'Salut')
    expect(typeof written).toBe('string')
    expect(readRichTextNode(written, [0, 0])).toBe('Salut')
  })

  it('reads and writes a node by path without touching neighbours', () => {
    const written = writeRichTextNode(tree(), [1, 2], ' et ') as ReturnType<typeof tree>
    expect(readRichTextNode(written, [1, 2])).toBe(' et ')
    expect(readRichTextNode(written, [1, 0])).toBe('Hello ')
  })
})

describe('sub-fields and staleness', () => {
  const docOf = (answer: unknown) => faq(answer)
  const liveOf = (doc: Record<string, unknown>): LiveDocument => ({
    collection: 'faqs',
    documentId: '3',
    sourceId: 'faqs:3',
    title: 'What?',
    slug: null,
    updatedAt: null,
    fields: new Map(fieldsForDocument('faqs', doc).map((f) => [f.path, sourceTextOf(valueAtPath(doc, f.path))])),
  })
  const rowFor = (path: string, sourceText: string): Pick<TranslationRow, 'fieldPath' | 'sourceText'> => ({
    fieldPath: path,
    sourceText,
  })

  it('lists every text node as a sub-field grouped under the field', () => {
    const fields = fieldsForDocument('faqs', docOf(tree())).filter((f) => f.path.startsWith('answer#'))
    expect(fields.map((f) => f.path)).toEqual(['answer#0.0', 'answer#1.0', 'answer#1.1', 'answer#1.2', 'answer#1.3.0'])
    expect(fields.every((f) => f.group?.key === 'answer')).toBe(true)
  })

  it('a text edit makes that node outdated, not inactive', () => {
    const before = docOf(tree())
    const edited = JSON.parse(JSON.stringify(tree()))
    edited.root.children[0].children[0].text = 'Welcome back'
    const live = liveOf(docOf(edited))
    expect(classifyTranslation(rowFor('answer#0.0', 'Welcome'), live, false)).toBe('outdated')
    expect(before).toBeTruthy()
  })

  it('inserting a block before the others makes the shifted rows outdated', () => {
    const inserted = tree()
    inserted.root.children.unshift(para(text('New intro')))
    const live = liveOf(docOf(inserted))
    // The row written for 'Welcome' at #0.0 now points at the new intro.
    expect(classifyTranslation(rowFor('answer#0.0', 'Welcome'), live, false)).toBe('outdated')
  })

  it('deleting the block a row points at makes that row inactive', () => {
    const shorter = tree()
    shorter.root.children.splice(1, 1)
    const live = liveOf(docOf(shorter))
    expect(classifyTranslation(rowFor('answer#1.3.0', 'the site'), live, false)).toBe('inactive')
  })

  it('an unchanged tree keeps every row active', () => {
    const live = liveOf(docOf(tree()))
    expect(classifyTranslation(rowFor('answer#1.1', 'bold'), live, false)).toBe('active')
  })
})
