// @vitest-environment node
// Email designer engine (src/features/email/design) and the send-time choice of design (designRender.ts). Pure: no database.
import { describe, expect, it } from 'vitest'

import { brandFrom, DEFAULT_EMAIL_BRAND, type EmailBrand } from '@/features/email/design/brand'
import { renderEmailHtml, renderEmailText, validateEmailBlocks, lintEmail, type EmailBlock } from '@/features/email/design'
import type { ButtonBlock, HeadingBlock, TextBlock } from '@/features/email/design/types'
import { brandFromStored, designedBlocks, renderWithDesign, storedLogo } from '@/features/email/designRender'
import { brandPatch, designField, logoIdFrom, parseDesignSave, resetPatch, templatePatch } from '@/features/email/designerSave'
import { duplicateAt, moveAt, sampleVars, starterBlocks, tagsFor } from '@/admin/views/email-designer/designerModel'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'

const brand: EmailBrand = { ...DEFAULT_EMAIL_BRAND, enabled: true }
const text = (value: string): TextBlock => ({ type: 'text', text: value, align: 'left' })
const heading = (value: string): HeadingBlock => ({ type: 'heading', text: value, level: 1, align: 'left' })
const button = (label: string, url: string): ButtonBlock => ({ type: 'button', label, url, align: 'center' })
const html = (blocks: EmailBlock[], vars: Record<string, string> = {}) => renderEmailHtml(blocks, brand, { vars })

describe('escaping and tags', () => {
  it('escapes HTML in text blocks', () => {
    const out = html([text('<script>alert("x")</script> & more')])
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more')
  })

  it('escapes HTML in headings and footers', () => {
    const out = html([heading('<b>Hi</b>'), { type: 'footerNote', text: "It's <i>small</i>" }])
    expect(out).toContain('&lt;b&gt;Hi&lt;/b&gt;')
    expect(out).toContain('It&#39;s &lt;i&gt;small&lt;/i&gt;')
  })

  it('fills tags with escaped values', () => {
    const out = html([text('Hello {{name}}')], { name: '<Ann>' })
    expect(out).toContain('Hello &lt;Ann&gt;')
  })

  it('does not let a value add bold or a link', () => {
    const out = html([text('Hi {{name}}')], { name: '**boss** [x](https://evil.example)' })
    expect(out).not.toContain('<strong')
    expect(out).not.toContain('href="https://evil.example"')
  })

  it('removes a tag with no value', () => {
    expect(html([text('A {{missing}} B')])).toContain('A  B')
  })
})

describe('links', () => {
  it('turns bold and safe links into HTML', () => {
    const out = html([text('**Bold** and [the shop](https://example.com/shop)')])
    expect(out).toContain('<strong style="font-weight:bold;">Bold</strong>')
    expect(out).toContain('href="https://example.com/shop"')
  })

  it('refuses javascript links, leaving the label as text', () => {
    const out = html([text('[click](javascript:alert(1))')])
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href=')
    expect(out).toContain('click')
  })

  it('accepts mailto links', () => {
    expect(html([text('[write to us](mailto:hi@example.com)')])).toContain('href="mailto:hi@example.com"')
  })

  it('drops a button whose link is unsafe at send time', () => {
    const out = html([button('Go', '{{link}}')], { link: 'javascript:void(0)' })
    expect(out).not.toContain('href="javascript')
    expect(out).toContain('Go')
  })

  it('escapes quotes in link addresses', () => {
    const out = html([button('Go', 'https://example.com/?a="b"')])
    expect(out).toContain('href="https://example.com/?a=&quot;b&quot;"')
  })
})

describe('email-safe structure', () => {
  const sample: EmailBlock[] = [
    heading('Welcome'),
    text('Body text'),
    button('Open', 'https://example.com'),
    { type: 'image', src: 'https://example.com/a.png', alt: 'Logo', width: 200, align: 'center' },
    { type: 'divider' },
    { type: 'spacer', height: 20 },
    { type: 'columns2', left: [text('Left')], right: [text('Right')] },
    { type: 'social', links: [{ network: 'facebook', url: 'https://facebook.com/x' }] },
    { type: 'footerNote', text: 'Small print' },
  ]
  const out = html(sample)

  it('uses table layout with presentation roles', () => {
    expect(out).toContain('role="presentation"')
    expect(out).toContain('<table')
  })

  it('does not use flex, grid or positioning', () => {
    expect(out).not.toMatch(/display:\s*flex/)
    expect(out).not.toMatch(/display:\s*grid/)
    expect(out).not.toMatch(/position:\s*(absolute|fixed|relative)/)
  })

  it('puts inline styles on every table cell and link', () => {
    const cells = out.match(/<td\b[^>]*>/g) ?? []
    const links = out.match(/<a\b[^>]*>/g) ?? []
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) expect(cell).toContain('style=')
    for (const link of links) expect(link).toContain('style=')
  })

  it('gives images width, height rules, alt text and no border', () => {
    expect(out).toMatch(/<img [^>]*alt="Logo"/)
    expect(out).toContain('display:block;border:0')
    expect(out).toContain('width="200"')
  })

  it('renders the two-column row with stacking classes', () => {
    expect(out).toContain('class="stack"')
    expect(out).toContain('Left')
    expect(out).toContain('Right')
  })

  it('declares colour scheme support and a mobile media query', () => {
    expect(out).toContain('name="color-scheme" content="light dark"')
    expect(out).toContain('@media only screen and (max-width: 620px)')
  })

  it('has a hidden preheader filled with tags', () => {
    const withPre = renderEmailHtml([text('x')], brand, { preheader: 'Hi {{name}}', vars: { name: 'Ann' } })
    expect(withPre).toContain('display:none')
    expect(withPre).toContain('Hi Ann')
  })

  it('wraps the email in the brand footer and address', () => {
    const footed = renderEmailHtml([text('x')], { ...brand, footerText: 'You got this email because...', address: '1 High St' })
    expect(footed).toContain('You got this email because...')
    expect(footed).toContain('1 High St')
  })

  it('shows the logo when one is set', () => {
    const logo = renderEmailHtml([text('x')], { ...brand, logoUrl: 'https://example.com/logo.png', logoWidth: 120 })
    expect(logo).toContain('src="https://example.com/logo.png"')
    expect(logo).toContain('width="120"')
  })

  it('uses the brand font and colours', () => {
    const custom = renderEmailHtml([text('x')], { ...brand, fontStack: 'georgia', textColor: '#123456' })
    expect(custom).toContain('Georgia')
    expect(custom).toContain('#123456')
  })
})

describe('button contrast and colour', () => {
  it('uses the accent colour by default', () => {
    expect(html([button('Go', 'https://example.com')])).toContain(`bgcolor="${brand.accent}"`)
  })

  it('uses a per-button colour when given', () => {
    const out = html([{ ...button('Go', 'https://example.com'), color: '#ff0000' }])
    expect(out).toContain('bgcolor="#ff0000"')
  })

  it('uses dark text on a light button', () => {
    const out = html([{ ...button('Go', 'https://example.com'), color: '#ffff00' }])
    expect(out).toContain('color:#111111')
  })
})

describe('plain text', () => {
  it('has no HTML tags', () => {
    const out = renderEmailText([heading('Hi'), text('**Bold** and [link](https://example.com)')], brand)
    expect(out).not.toMatch(/<[a-z]/i)
    expect(out).toContain('Bold and link (https://example.com)')
  })

  it('does not escape values, since it is not HTML', () => {
    expect(renderEmailText([text('Hi {{name}}')], brand, { name: 'A & B' })).toContain('Hi A & B')
  })

  it('shows buttons as label and link', () => {
    expect(renderEmailText([button('Open', 'https://example.com')], brand)).toContain('Open: https://example.com')
  })

  it('reads both columns in order', () => {
    const out = renderEmailText([{ type: 'columns2', left: [text('First')], right: [text('Second')] }], brand)
    expect(out.indexOf('First')).toBeLessThan(out.indexOf('Second'))
  })

  it('ends with one newline and no blank run at the end', () => {
    const out = renderEmailText([text('Only')], brand)
    expect(out.endsWith('Only\n')).toBe(true)
  })

  it('adds the footer', () => {
    expect(renderEmailText([text('x')], { ...brand, footerText: 'Footer here' })).toContain('Footer here')
  })
})

describe('validateEmailBlocks', () => {
  it('accepts a valid design', () => {
    const result = validateEmailBlocks([heading('Hi'), text('Body'), button('Go', 'https://example.com')])
    expect(result.ok).toBe(true)
  })

  it('refuses a design over 40 blocks', () => {
    const many = Array.from({ length: 41 }, () => text('x'))
    const result = validateEmailBlocks(many)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/40/)
  })

  it('accepts exactly 40 blocks', () => {
    expect(validateEmailBlocks(Array.from({ length: 40 }, () => text('x'))).ok).toBe(true)
  })

  it('refuses an unknown block type', () => {
    expect(validateEmailBlocks([{ type: 'video', src: 'x' }]).ok).toBe(false)
  })

  it('refuses a javascript button link', () => {
    expect(validateEmailBlocks([{ type: 'button', label: 'Go', url: 'javascript:alert(1)', align: 'left' }]).ok).toBe(false)
  })

  it('accepts a link that is only a tag', () => {
    expect(validateEmailBlocks([{ type: 'button', label: 'Go', url: '{{link}}', align: 'left' }]).ok).toBe(true)
  })

  it('refuses a non-web image address', () => {
    expect(validateEmailBlocks([{ type: 'image', src: 'data:image/png;base64,AAAA', alt: 'x', width: 10 }]).ok).toBe(false)
  })

  it('refuses text that is too long', () => {
    expect(validateEmailBlocks([text('x'.repeat(5001))]).ok).toBe(false)
  })

  it('refuses an empty text block', () => {
    expect(validateEmailBlocks([text('   ')]).ok).toBe(false)
  })

  it('clamps numbers into range', () => {
    const result = validateEmailBlocks([{ type: 'spacer', height: 9999 }, { type: 'image', src: 'https://example.com/a.png', alt: '', width: 5000 }])
    expect(result).toMatchObject({ ok: true, blocks: [{ height: 200 }, { width: 600 }] })
  })

  it('refuses a block inside a column that is not allowed there', () => {
    expect(validateEmailBlocks([{ type: 'columns2', left: [{ type: 'divider' }], right: [] }]).ok).toBe(false)
  })

  it('refuses a column with more than 10 blocks', () => {
    const left = Array.from({ length: 11 }, () => text('x'))
    expect(validateEmailBlocks([{ type: 'columns2', left, right: [] }]).ok).toBe(false)
  })

  it('refuses a social link to an unknown network', () => {
    expect(validateEmailBlocks([{ type: 'social', links: [{ network: 'myspace', url: 'https://example.com' }] }]).ok).toBe(false)
  })

  it('refuses a non-array design', () => {
    expect(validateEmailBlocks({ type: 'text' }).ok).toBe(false)
  })

  it('never throws on odd input', () => {
    expect(() => validateEmailBlocks([null, 1, 'x'])).not.toThrow()
    expect(validateEmailBlocks([null]).ok).toBe(false)
  })

  it('drops unknown fields', () => {
    const result = validateEmailBlocks([{ type: 'divider', evil: '<script>' }])
    expect(result).toEqual({ ok: true, blocks: [{ type: 'divider' }] })
  })
})

describe('lintEmail', () => {
  it('warns on an empty design', () => {
    expect(lintEmail([]).map((w) => w.code)).toEqual(['empty'])
  })

  it('warns when an image has no alt text', () => {
    expect(lintEmail([{ type: 'image', src: 'https://example.com/a.png', alt: '', width: 100 }]).map((w) => w.code)).toContain('image-no-alt')
  })

  it('warns on a vague button label', () => {
    expect(lintEmail([button('Click here', 'https://example.com')]).map((w) => w.code)).toContain('vague-link')
  })

  it('warns on a vague link in text', () => {
    expect(lintEmail([text('Please [click here](https://example.com)')]).map((w) => w.code)).toContain('vague-link')
  })

  it('warns on marketing email without a footer', () => {
    expect(lintEmail([text('Sale!')], { marketing: true }).map((w) => w.code)).toContain('no-footer')
  })

  it('does not warn about the footer when there is one', () => {
    expect(lintEmail([text('Sale!'), { type: 'footerNote', text: 'Stop here' }], { marketing: true }).map((w) => w.code)).not.toContain('no-footer')
  })

  it('warns when the email is very heavy', () => {
    const big = Array.from({ length: 40 }, () => text('x'.repeat(4900)))
    expect(lintEmail(big).map((w) => w.code)).toContain('too-heavy')
  })

  it('is quiet for a clean design', () => {
    expect(lintEmail([heading('Hi'), text('Your order is ready.'), button('View order', 'https://example.com')])).toEqual([])
  })
})

describe('send-time choice of design (designRender)', () => {
  const template = EMAIL_TEMPLATE_DEFAULTS.accountWelcome

  it('uses the design when the template has one', () => {
    const out = renderWithDesign(template, { link: 'https://example.com/a' }, [button('Open', '{{link}}')], brand)
    expect(out.html).toContain('href="https://example.com/a"')
    expect(out.subject).toBe(template.subject)
  })

  it('keeps the plain output when there is no design and the brand is off', () => {
    const out = renderWithDesign(template, { link: 'https://example.com/a' }, null, { ...brand, enabled: false })
    expect(out.html).toBe('<p>Your account is ready.</p>\n<p>You can see your orders, addresses and bookings here:<br />https://example.com/a</p>')
  })

  it('wraps the plain wording in the brand when the brand is on', () => {
    const out = renderWithDesign(template, { link: 'https://example.com/a' }, null, brand)
    expect(out.html).toContain('<!doctype html>')
    expect(out.text).toContain('Your account is ready.')
  })

  it('finds no design for an empty or invalid stored value', () => {
    expect(designedBlocks(null)).toBeNull()
    expect(designedBlocks([])).toBeNull()
    expect(designedBlocks([{ type: 'nope' }])).toBeNull()
  })

  it('reads the brand with the logo turned into an absolute link', () => {
    const read = brandFromStored({ enabled: true, fontStack: 'verdana', logo: { id: 1, url: '/media/logo.png' } })
    expect(read.enabled).toBe(true)
    expect(read.fontStack).toBe('verdana')
    expect(read.logoUrl).toMatch(/^https:\/\/.+\/media\/logo\.png$/)
  })

  it('falls back to defaults for a bad brand', () => {
    const bad = brandFrom({ accent: 'red', fontStack: 'Comic Sans', buttonRadius: 999, logoUrl: 'javascript:x' })
    expect(bad.accent).toBe(DEFAULT_EMAIL_BRAND.accent)
    expect(bad.fontStack).toBe(DEFAULT_EMAIL_BRAND.fontStack)
    expect(bad.buttonRadius).toBe(30)
    expect(bad.logoUrl).toBe('')
  })
})

describe('Email designer save rules (designerSave)', () => {
  const para = { type: 'text', text: 'Hello {{name}}', align: 'left' }

  it('reads a logo id from a number or a digit string only', () => {
    expect(logoIdFrom(12)).toBe(12)
    expect(logoIdFrom('34')).toBe(34)
    expect(logoIdFrom(0)).toBeNull()
    expect(logoIdFrom(-1)).toBeNull()
    expect(logoIdFrom(1.5)).toBeNull()
    expect(logoIdFrom('abc')).toBeNull()
    expect(logoIdFrom(null)).toBeNull()
  })

  it('saves the brand with the logo as a media id and never a logoUrl', () => {
    const parsed = parseDesignSave({ kind: 'brand', logo: '7', brand: { logoUrl: 'https://evil.example/x.png', accent: '#abc' } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok || parsed.request.kind !== 'brand') throw new Error('expected a brand save')
    expect(parsed.request.logo).toBe(7)
    const patch = brandPatch(parsed.request.brand, parsed.request.logo)
    expect(patch).not.toHaveProperty('logoUrl')
    expect(patch.logo).toBe(7)
    expect(patch.accent).toBe('#aabbcc')
  })

  it('writes no logo when none is chosen', () => {
    const parsed = parseDesignSave({ kind: 'brand', brand: {} })
    if (!parsed.ok || parsed.request.kind !== 'brand') throw new Error('expected a brand save')
    expect(brandPatch(parsed.request.brand, parsed.request.logo).logo).toBeNull()
  })

  it('refuses an unknown template key', () => {
    const parsed = parseDesignSave({ kind: 'template', key: 'nope', subject: 'x', blocks: [para] })
    expect(parsed).toEqual({ ok: false, error: 'That email template does not exist.' })
  })

  it('refuses an empty or over-long subject line', () => {
    expect(parseDesignSave({ kind: 'template', key: 'accountReset', subject: '  ', blocks: [para] }).ok).toBe(false)
    const long = parseDesignSave({ kind: 'template', key: 'accountReset', subject: 'x'.repeat(301), blocks: [para] })
    expect(long.ok).toBe(false)
  })

  it('removes line breaks from the subject and keeps good blocks', () => {
    const parsed = parseDesignSave({ kind: 'template', key: 'accountReset', subject: 'Reset\nnow', blocks: [para] })
    if (!parsed.ok || parsed.request.kind !== 'template') throw new Error('expected a template save')
    expect(parsed.request.subject).toBe('Reset now')
    expect(parsed.request.blocks).toHaveLength(1)
  })

  it('refuses a design over the block cap and surfaces the reason', () => {
    const parsed = parseDesignSave({ kind: 'template', key: 'accountReset', subject: 's', blocks: Array(41).fill(para) })
    expect(parsed.ok).toBe(false)
    if (parsed.ok === false) expect(parsed.error).toMatch(/at most 40/)
  })

  it('reset clears the design and the wording; a template save keeps the current body', () => {
    expect(resetPatch('accountReset')).toEqual({ accountReset: { subject: null, body: null }, accountResetDesign: null })
    const patch = templatePatch('accountReset', 'Subject', [], 'Kept body')
    expect(patch).toEqual({ accountReset: { subject: 'Subject', body: 'Kept body' }, accountResetDesign: [] })
    expect(designField('accountReset')).toBe('accountResetDesign')
  })

  it('reads the logo id and an absolute address for the designer, or null', () => {
    expect(storedLogo({ logo: 5 })).toBeNull()
    expect(storedLogo({})).toBeNull()
    expect(storedLogo({ logo: { id: 5, url: '/media/a.png' } })).toEqual({ id: 5, url: expect.stringMatching(/^https:\/\/.+\/media\/a\.png$/) })
    expect(storedLogo({ logo: { id: 5 } })).toEqual({ id: 5, url: '' })
  })
})

describe('Email designer screen helpers (designerModel)', () => {
  const list = ['a', 'b', 'c']

  it('moves an item up or down and leaves edges alone', () => {
    expect(moveAt(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveAt(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveAt(list, 0, -1)).toBe(list)
    expect(moveAt(list, 2, 1)).toBe(list)
  })

  it('duplicates an item straight after itself as a copy', () => {
    const blocks = [{ type: 'divider' as const }]
    const copied = duplicateAt(blocks, 0)
    expect(copied).toHaveLength(2)
    expect(copied[1]).not.toBe(blocks[0])
    expect(duplicateAt(blocks, 5)).toBe(blocks)
  })

  it('starts a design from the paragraphs of the current wording', () => {
    const blocks = starterBlocks('First line\nstill first.\n\nSecond paragraph.')
    expect(blocks).toEqual([
      { type: 'text', text: 'First line\nstill first.', align: 'left' },
      { type: 'text', text: 'Second paragraph.', align: 'left' },
    ])
    expect(starterBlocks('   ')).toHaveLength(1)
  })

  it('lists the tags a template uses, and gives each a sample', () => {
    expect(tagsFor('accountReset')).toContain('link')
    expect(tagsFor('no-such-template')).toEqual([])
    const vars = sampleVars('accountReset')
    expect(vars.link).toMatch(/^https:\/\//)
    expect(Object.keys(vars)).toEqual(tagsFor('accountReset'))
  })

  it('uses the built-in wording as the starting point for every template', () => {
    for (const key of Object.keys(EMAIL_TEMPLATE_DEFAULTS)) {
      expect(starterBlocks(EMAIL_TEMPLATE_DEFAULTS[key as keyof typeof EMAIL_TEMPLATE_DEFAULTS].body).length).toBeGreaterThan(0)
    }
  })
})
