// This suite proves `src/localapi/richtext.tsx`'s `RichText` component is a
// byte-for-byte rendering match for real Payload's own
// `@payloadcms/richtext-lexical/react` `RichText`, for every node type,
// text-format bit, align/indent case, and empty-content edge case that this
// app's stored Lexical JSON can actually contain (see richtext.tsx's header
// comment for the scoping: this app uses exactly one, entirely-default
// editor feature set everywhere, and every render site passes no
// `converters` override - so real Payload's own unmodified default
// converters are the exact target to match, not something bespoke).
//
// Both sides are rendered with `react-dom/server`'s `renderToStaticMarkup`
// and compared as plain HTML strings. The one case that can never produce
// identical output byte-for-byte is the checklist `<input>`/`<label>` `id`/
// `htmlFor` pair: both implementations mint a fresh random id per render
// (real Payload via the `uuid` package, ours via `crypto.randomUUID()` per
// this project's zero-new-dependency policy - see richtext.tsx's header
// comment) - so that one case strips both ids with a regex before comparing.
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { RichText as RealRichText } from '@payloadcms/richtext-lexical/react'
import { RichText as OurRichText } from '@/localapi/richtext'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g

function renderBoth(data: unknown, props: Record<string, unknown> = {}): { ours: string, real: string } {
  // Fixtures below are loosely-typed raw JSON (this app's own stored richText
  // values are `unknown` at every call site too - see richtext.tsx's own
  // `RichTextProps.data?: unknown`), so real Payload's own narrower generic
  // `data` prop type doesn't structurally match without a cast.
  const realProps = { data, ...props } as any // eslint-disable-line @typescript-eslint/no-explicit-any -- see comment above
  const real = renderToStaticMarkup(React.createElement(RealRichText, realProps))
  const ours = renderToStaticMarkup(React.createElement(OurRichText, { data, ...props }))
  return { ours, real }
}

function expectParity(data: unknown, props: Record<string, unknown> = {}): void {
  const { ours, real } = renderBoth(data, props)
  expect(ours).toEqual(real)
}

function textNode(text: string, format = 0): Record<string, unknown> {
  return { type: 'text', text, format, detail: 0, mode: 'normal', style: '', version: 1 }
}

function paragraph(children: Record<string, unknown>[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'paragraph', children, direction: 'ltr', format: '', indent: 0, version: 1, ...extra }
}

function doc(children: Record<string, unknown>[]): Record<string, unknown> {
  return { root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 } }
}

describe('localapi richtext parity - text formatting', () => {
  it('renders each individual format bit identically', () => {
    const bits = [
      ['bold', 1],
      ['italic', 1 << 1],
      ['strikethrough', 1 << 2],
      ['underline', 1 << 3],
      ['code', 1 << 4],
      ['subscript', 1 << 5],
      ['superscript', 1 << 6],
    ] as const
    for (const [label, bit] of bits) {
      expectParity(doc([paragraph([textNode(label, bit)])]))
    }
  })

  it('renders a multi-bit combination with the exact real wrapping/nesting order', () => {
    // bold + italic + underline + code, all at once
    const format = 1 | (1 << 1) | (1 << 3) | (1 << 4)
    expectParity(doc([paragraph([textNode('combo', format)])]))
  })

  it('IS_HIGHLIGHT (1 << 7) is unhandled on both sides - plain text either way', () => {
    expectParity(doc([paragraph([textNode('highlighted', 1 << 7)])]))
  })

  it('plain unformatted text', () => {
    expectParity(doc([paragraph([textNode('plain text')])]))
  })
})

describe('localapi richtext parity - block types', () => {
  it('empty paragraph renders <p><br/></p> on both sides', () => {
    expectParity(doc([paragraph([])]))
  })

  it('non-empty paragraph', () => {
    expectParity(doc([paragraph([textNode('hello world')])]))
  })

  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)('heading %s', (tag) => {
    expectParity(doc([{ type: 'heading', tag, children: [textNode(`Heading ${tag}`)], direction: 'ltr', format: '', indent: 0, version: 1 }]))
  })

  it('blockquote', () => {
    expectParity(doc([{ type: 'quote', children: [textNode('a quote')], direction: 'ltr', format: '', indent: 0, version: 1 }]))
  })

  it('horizontalrule', () => {
    expectParity(doc([{ type: 'horizontalrule', version: 1 }]))
  })

  it('linebreak and tab inside a paragraph', () => {
    expectParity(doc([paragraph([textNode('before'), { type: 'linebreak', version: 1 }, { type: 'tab', version: 1 }, textNode('after')])]))
  })
})

describe('localapi richtext parity - lists', () => {
  it('bullet list', () => {
    expectParity(doc([{
      type: 'list',
      tag: 'ul',
      listType: 'bullet',
      start: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        { type: 'listitem', value: 1, children: [textNode('one')], direction: 'ltr', format: '', indent: 0, version: 1 },
        { type: 'listitem', value: 2, children: [textNode('two')], direction: 'ltr', format: '', indent: 0, version: 1 },
      ],
    }]))
  })

  it('numbered list', () => {
    expectParity(doc([{
      type: 'list',
      tag: 'ol',
      listType: 'number',
      start: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        { type: 'listitem', value: 1, children: [textNode('first')], direction: 'ltr', format: '', indent: 0, version: 1 },
        { type: 'listitem', value: 2, children: [textNode('second')], direction: 'ltr', format: '', indent: 0, version: 1 },
      ],
    }]))
  })

  it('nested sublist inside a listitem', () => {
    expectParity(doc([{
      type: 'list',
      tag: 'ul',
      listType: 'bullet',
      start: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'listitem',
          value: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'list',
              tag: 'ul',
              listType: 'bullet',
              start: 1,
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                { type: 'listitem', value: 1, children: [textNode('nested')], direction: 'ltr', format: '', indent: 0, version: 1 },
              ],
            },
          ],
        },
      ],
    }]))
  })

  it('checklist with a checked and an unchecked item (UUID-stripped comparison)', () => {
    const { ours, real } = renderBoth(doc([{
      type: 'list',
      tag: 'ul',
      listType: 'check',
      start: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        { type: 'listitem', value: 1, checked: true, children: [textNode('done')], direction: 'ltr', format: '', indent: 0, version: 1 },
        { type: 'listitem', value: 2, checked: false, children: [textNode('todo')], direction: 'ltr', format: '', indent: 0, version: 1 },
      ],
    }]))
    expect(ours.replace(UUID_RE, 'UUID')).toEqual(real.replace(UUID_RE, 'UUID'))
  })

  it('checklist item with a nested sublist (outer item skips input/label, but the leaf item still gets one - UUID-stripped comparison)', () => {
    const { ours, real } = renderBoth(doc([{
      type: 'list',
      tag: 'ul',
      listType: 'check',
      start: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'listitem',
          value: 1,
          checked: false,
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'list',
              tag: 'ul',
              listType: 'check',
              start: 1,
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                { type: 'listitem', value: 1, checked: false, children: [textNode('nested todo')], direction: 'ltr', format: '', indent: 0, version: 1 },
              ],
            },
          ],
        },
      ],
    }]))
    expect(ours.replace(UUID_RE, 'UUID')).toEqual(real.replace(UUID_RE, 'UUID'))
  })
})

describe('localapi richtext parity - links', () => {
  it('custom URL link, no newTab', () => {
    expectParity(doc([paragraph([{
      type: 'link',
      fields: { linkType: 'custom', url: 'https://example.com', newTab: false },
      children: [textNode('a link')],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    }])]))
  })

  it('custom URL link with newTab', () => {
    expectParity(doc([paragraph([{
      type: 'link',
      fields: { linkType: 'custom', url: 'https://example.com', newTab: true },
      children: [textNode('a link')],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    }])]))
  })

  it('internal link with no resolver: both sides fall back to href="#" (and both log a console.error)', () => {
    expectParity(doc([paragraph([{
      type: 'link',
      fields: { linkType: 'internal', newTab: false },
      children: [textNode('internal')],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    }])]))
  })

  it('autolink with newTab', () => {
    expectParity(doc([paragraph([{
      type: 'autolink',
      fields: { linkType: 'custom', url: 'https://auto.example.com', newTab: true },
      children: [textNode('https://auto.example.com')],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    }])]))
  })
})

describe('localapi richtext parity - uploads', () => {
  it('unpopulated upload value (non-object) renders nothing on either side', () => {
    expectParity(doc([paragraph([{ type: 'upload', value: 3, fields: null, version: 1 }])]))
  })

  it('image upload with no sizes renders a plain <img>', () => {
    expectParity(doc([paragraph([{
      type: 'upload',
      version: 1,
      fields: { alt: 'field alt' },
      value: {
        id: 1,
        alt: 'doc alt',
        url: '/media/photo.jpg',
        mimeType: 'image/jpeg',
        width: 800,
        height: 600,
        filename: 'photo.jpg',
      },
    }])]))
  })

  it('image upload with sizes renders a <picture> with matching <source> entries', () => {
    expectParity(doc([paragraph([{
      type: 'upload',
      version: 1,
      fields: {},
      value: {
        id: 2,
        alt: 'sized image',
        url: '/media/photo-original.jpg',
        mimeType: 'image/jpeg',
        width: 1600,
        height: 1200,
        filename: 'photo-original.jpg',
        sizes: {
          thumbnail: {
            width: 400,
            height: 300,
            mimeType: 'image/jpeg',
            filesize: 12345,
            filename: 'photo-thumbnail.jpg',
            url: '/media/photo-thumbnail.jpg',
          },
          card: {
            width: 800,
            height: 600,
            mimeType: 'image/jpeg',
            filesize: 45678,
            filename: 'photo-card.jpg',
            url: '/media/photo-card.jpg',
          },
          // Deliberately incomplete size (missing filesize) - both sides
          // must skip it rather than render a broken <source>.
          incomplete: {
            width: 200,
            height: 150,
            mimeType: 'image/jpeg',
            filename: 'photo-incomplete.jpg',
            url: '/media/photo-incomplete.jpg',
          },
        },
      },
    }])]))
  })

  it('non-image upload renders a plain link with the filename', () => {
    expectParity(doc([paragraph([{
      type: 'upload',
      version: 1,
      fields: {},
      value: {
        id: 3,
        url: '/media/report.pdf',
        mimeType: 'application/pdf',
        filename: 'report.pdf',
      },
    }])]))
  })
})

describe('localapi richtext parity - align and indent', () => {
  it.each(['center', 'end', 'justify', 'right', 'start', 'left'] as const)('paragraph format=%s', (format) => {
    expectParity(doc([paragraph([textNode('aligned')], { format })]))
  })

  it('indent level 1 and level 2 on a paragraph', () => {
    expectParity(doc([paragraph([textNode('indented once')], { indent: 1 })]))
    expectParity(doc([paragraph([textNode('indented twice')], { indent: 2 })]))
  })

  it('indent on a listitem is NOT translated into padding (unlike other block types)', () => {
    expectParity(doc([{
      type: 'list',
      tag: 'ul',
      listType: 'bullet',
      start: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        { type: 'listitem', value: 1, children: [textNode('should not be padded')], direction: 'ltr', format: '', indent: 2, version: 1 },
      ],
    }]))
  })

  it('heading with both align and indent set simultaneously', () => {
    expectParity(doc([{ type: 'heading', tag: 'h2', format: 'center', indent: 1, children: [textNode('styled heading')], direction: 'ltr', version: 1 }]))
  })
})

describe('localapi richtext parity - unrecognized nodes', () => {
  it('a relationship node falls back to "unknown node" on both sides (no default converter exists for it in real Payload either)', () => {
    expectParity(doc([paragraph([{
      type: 'relationship',
      version: 1,
      relationTo: 'posts',
      value: { id: 42 },
    }])]))
  })

  it('a wholly-unrecognized node type falls back to "unknown node" on both sides', () => {
    expectParity(doc([paragraph([{ type: 'totally-made-up-node-type', version: 1 }])]))
  })
})

describe('localapi richtext parity - tables (unreachable via this app\'s enabled features, included for completeness)', () => {
  it('a full table/tablerow/tablecell tree, including a header cell and colSpan/rowSpan', () => {
    expectParity(doc([{
      type: 'table',
      version: 1,
      children: [
        {
          type: 'tablerow',
          version: 1,
          children: [
            { type: 'tablecell', headerState: 1, version: 1, children: [textNode('Header')] },
            { type: 'tablecell', headerState: 1, colSpan: 2, version: 1, children: [textNode('Header 2')] },
          ],
        },
        {
          type: 'tablerow',
          version: 1,
          children: [
            { type: 'tablecell', headerState: 0, version: 1, children: [textNode('cell a')] },
            { type: 'tablecell', headerState: 0, rowSpan: 2, backgroundColor: '#eee', version: 1, children: [textNode('cell b')] },
          ],
        },
      ],
    }]))
  })
})

describe('localapi richtext parity - empty-content / hasText edge cases', () => {
  it('no root children at all renders the empty container', () => {
    expectParity(doc([]))
  })

  it('a single empty paragraph (no children) renders the empty container', () => {
    expectParity(doc([paragraph([])]))
  })

  it('a single paragraph with one empty-string text child renders the empty container', () => {
    expectParity(doc([paragraph([textNode('')])]))
  })

  it('null/undefined data renders nothing (component returns null) on both sides', () => {
    expect(renderToStaticMarkup(React.createElement(OurRichText, { data: null }))).toEqual('')
    expect(renderToStaticMarkup(React.createElement(RealRichText, { data: null }))).toEqual('')
  })

  it('non-empty content with disableContainer renders the bare content with no wrapping <div>', () => {
    expectParity(doc([paragraph([textNode('no wrapper')])]), { disableContainer: true })
  })

  it('empty content with disableContainer renders nothing on both sides', () => {
    expectParity(doc([paragraph([])]), { disableContainer: true })
  })
})

describe('localapi richtext parity - a realistic combined document', () => {
  it('renders a heading, a paragraph with mixed formatting, a list, and a link together identically', () => {
    expectParity(doc([
      { type: 'heading', tag: 'h2', children: [textNode('Section title')], direction: 'ltr', format: '', indent: 0, version: 1 },
      paragraph([
        textNode('Some '),
        textNode('bold', 1),
        textNode(' and '),
        {
          type: 'link',
          fields: { linkType: 'custom', url: 'https://example.com', newTab: true },
          children: [textNode('a link')],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
        textNode(' in the same paragraph.'),
      ]),
      {
        type: 'list',
        tag: 'ul',
        listType: 'bullet',
        start: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          { type: 'listitem', value: 1, children: [textNode('item one')], direction: 'ltr', format: '', indent: 0, version: 1 },
          { type: 'listitem', value: 2, children: [textNode('item two')], direction: 'ltr', format: '', indent: 0, version: 1 },
        ],
      },
    ]))
  })
})
