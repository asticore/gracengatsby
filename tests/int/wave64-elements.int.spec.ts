import { describe, expect, it } from 'vitest'

import { parsePlaylist, tokenize } from '@/lib/elements/wave64Util'
import { parseVideoUrl } from '@/components/blocks/elements/elementUtil'

describe('wave64 tokenizer', () => {
  it('keeps every character in order', () => {
    const code = 'const a = "x<y>"; // hi\nlet n = 42'
    expect(tokenize(code, 'js').map((t) => t.v).join('')).toBe(code)
  })
  it('classifies keywords, strings, comments, numbers', () => {
    const t = tokenize('const a = "s" // c\n7', 'ts')
    expect(t.find((x) => x.t === 'kw')?.v).toBe('const')
    expect(t.find((x) => x.t === 'str')?.v).toBe('"s"')
    expect(t.find((x) => x.t === 'com')?.v).toBe('// c')
    expect(t.find((x) => x.t === 'num')?.v).toBe('7')
  })
  it('handles html tags and python comments, unknown language falls back', () => {
    expect(tokenize('<div class="a">', 'html')[0]).toEqual({ t: 'kw', v: '<div' })
    expect(tokenize('# hi', 'python')[0]?.t).toBe('com')
    expect(tokenize('x', 'cobol').length).toBe(1)
  })
  it('does not interpret markup (tokens are plain strings)', () => {
    expect(tokenize('<script>alert(1)</script>', 'html').map((t) => t.v).join('')).toBe('<script>alert(1)</script>')
  })
})

describe('wave64 playlist', () => {
  const raw = ['https://youtu.be/dQw4w9WgXcQ | Song', 'javascript:alert(1) | Bad', 'https://x.com/a.mp4', 'https://vimeo.com/123456789 | V'].join('\n')
  it('parses valid lines and drops bad ones', () => {
    const items = parsePlaylist(raw, parseVideoUrl)
    expect(items.map((i) => i.kind)).toEqual(['youtube', 'file', 'vimeo'])
    expect(items[0]?.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(items[1]?.title).toBe('Video 2')
  })
})
