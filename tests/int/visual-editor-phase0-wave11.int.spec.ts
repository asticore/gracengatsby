import { describe, expect, it } from 'vitest'
import { blockStyleCss, blockStyleToCss, blockFontStack } from '@/lib/blockStyle'
import { canEditAsPlainText, lexicalToPlainText, plainTextToLexical, RICH_TEXT_NOTICE } from '@/views/visualEditor/richTextUtil'

const para = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  type: 'paragraph',
  version: 1,
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  ...extra,
})
const text = (value: string, extra: Record<string, unknown> = {}) => ({ type: 'text', version: 1, text: value, format: 0, style: '', mode: 'normal', detail: 0, ...extra })
const doc = (children: unknown[]) => ({ root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 } })

describe('rich text: round-trip checker', () => {
  it('treats the editor own output as editable and round-trips it exactly', () => {
    const value = plainTextToLexical('First paragraph.\n\nSecond paragraph.')
    expect(canEditAsPlainText(value)).toBe(true)
    expect(plainTextToLexical(lexicalToPlainText(value))).toEqual(value)
  })

  it('accepts an empty value and a single empty paragraph', () => {
    expect(canEditAsPlainText(undefined)).toBe(true)
    expect(canEditAsPlainText(null)).toBe(true)
    expect(canEditAsPlainText(plainTextToLexical(''))).toBe(true)
  })

  it('accepts plain paragraphs that carry only default Lexical keys', () => {
    const value = doc([para([text('Hello there', { detail: 0 })], { textFormat: 0, textStyle: '' })])
    expect(canEditAsPlainText(value)).toBe(true)
  })

  it('refuses bold, italic and other text formatting', () => {
    expect(canEditAsPlainText(doc([para([text('Bold', { format: 1 })])]))).toBe(false)
    expect(canEditAsPlainText(doc([para([text('Italic', { format: 2 })])]))).toBe(false)
  })

  it('refuses text with a style string or a non-normal mode', () => {
    expect(canEditAsPlainText(doc([para([text('Red', { style: 'color: red;' })])]))).toBe(false)
    expect(canEditAsPlainText(doc([para([text('Token', { mode: 'token' })])]))).toBe(false)
  })

  it('refuses paragraph alignment and indent', () => {
    expect(canEditAsPlainText(doc([para([text('Centred')], { format: 'center' })]))).toBe(false)
    expect(canEditAsPlainText(doc([para([text('Indented')], { indent: 1 })]))).toBe(false)
  })

  it('refuses unknown or structural node types (headings, lists, links, line breaks)', () => {
    expect(canEditAsPlainText(doc([{ type: 'heading', version: 1, tag: 'h2', children: [text('Title')] }]))).toBe(false)
    expect(canEditAsPlainText(doc([{ type: 'list', version: 1, children: [] }]))).toBe(false)
    expect(canEditAsPlainText(doc([para([text('a'), { type: 'linebreak', version: 1 }, text('b')])]))).toBe(false)
    expect(canEditAsPlainText(doc([para([{ type: 'link', version: 1, url: 'https://example.com', children: [text('x')] }])]))).toBe(false)
  })

  it('refuses text the blank-line split would change, empty paragraphs and edge spaces', () => {
    expect(canEditAsPlainText(doc([para([text('one\n\ntwo')])]))).toBe(false)
    expect(canEditAsPlainText(doc([para([text('Padded ')])]))).toBe(false)
    expect(canEditAsPlainText(doc([para([text('a')]), para([]), para([text('b')])]))).toBe(false)
  })

  it('refuses a value that is not a Lexical root', () => {
    expect(canEditAsPlainText('just a string')).toBe(false)
    expect(canEditAsPlainText({ root: { type: 'other', children: [] } })).toBe(false)
  })

  it('exports the exact notice wording', () => {
    expect(RICH_TEXT_NOTICE).toBe('This text uses formatting the visual editor can not edit. Edit it in the normal page editor.')
  })
})

describe('block font', () => {
  it('resolves a built-in key to a stack and ignores anything else', () => {
    expect(blockFontStack('playfair')).toContain('Playfair Display')
    expect(blockFontStack('inter')).toContain('Inter')
    expect(blockFontStack(undefined)).toBeNull()
    expect(blockFontStack('')).toBeNull()
    expect(blockFontStack('constructor')).toBeNull()
    expect(blockFontStack("x;}body{display:none}")).toBeNull()
  })

  it('sets the inline font only when a built-in font is chosen', () => {
    expect(blockStyleToCss({ fontFamily: 'cinzel' }).fontFamily).toContain('Cinzel')
    expect(blockStyleToCss({}).fontFamily).toBeUndefined()
    expect(blockStyleToCss({ fontFamily: 'nope' }).fontFamily).toBeUndefined()
  })

  it('repeats the font on headings in the scoped rule', () => {
    const css = blockStyleCss({ fontFamily: 'jost' }, 'be-block-1')
    expect(css).toContain('#be-block-1 :is(h1,h2,h3,h4,h5,h6){font-family:')
    expect(css).toContain('Jost')
    expect(blockStyleCss({}, 'be-block-1')).toBe('')
  })
})
