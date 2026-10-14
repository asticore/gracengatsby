import { describe, it, expect } from 'vitest'
import { analyze, scoreOf, seoChecks } from '@/features/seo/analysis/analyze'
import { readabilityChecks, syllables, splitSentences } from '@/features/seo/analysis/readability'
import { countPhrase, hasAllWords, rawWords, stem, words } from '@/features/seo/analysis/keyphrase'
import { extractForAnalysis } from '@/features/seo/analysis/extract'
import type { AnalysisInput, Check, Status } from '@/features/seo/analysis/types'

const ofLength = (prefix: string, n: number) => `${prefix} ${'a'.repeat(n - prefix.length - 1)}`

const base: AnalysisInput = {
  title: 'Running shoes guide',
  slug: 'running-shoes-guide',
  metaTitle: 'Running shoes guide for every runner',
  metaDescription: ofLength('Running shoes guide for everyone', 140),
  keyphrase: 'running shoes',
  text: 'Running shoes matter for every runner.',
  headings: [],
  links: [],
  images: [],
}

function seo(over: Partial<AnalysisInput>): Check[] {
  return seoChecks({ ...base, ...over })
}

function find(checks: Check[], id: string): Check {
  const found = checks.find((c) => c.id === id)
  if (!found) throw new Error(`no check ${id}`)
  return found
}

function statusOf(checks: Check[], id: string): Status {
  return find(checks, id).status
}

describe('keyphrase helpers', () => {
  it('stems plurals and common endings', () => {
    expect(stem('dogs')).toBe('dog')
    expect(stem('houses')).toBe('house')
    expect(stem('boxes')).toBe('box')
    expect(stem('testing')).toBe('test')
    expect(stem('jumped')).toBe('jump')
    expect(stem('dress')).toBe('dress')
  })

  it('splits text into lower-case words without punctuation', () => {
    expect(rawWords('Hello, World! It\'s fine.')).toEqual(['hello', 'world', 'it', 's', 'fine'])
  })

  it('matches a phrase only when every word is present', () => {
    expect(hasAllWords(words('Best running shoe'), words('running shoes'))).toBe(true)
    expect(hasAllWords(words('Running gear'), words('running shoes'))).toBe(false)
    expect(hasAllWords(words('anything'), [])).toBe(false)
  })

  it('counts consecutive phrase runs', () => {
    expect(countPhrase(['a', 'b', 'a', 'b'], ['a', 'b'])).toBe(2)
    expect(countPhrase(['a', 'x', 'b'], ['a', 'b'])).toBe(0)
  })
})

describe('keyphrase checks', () => {
  it('flags a missing focus keyphrase and skips keyphrase checks', () => {
    const checks = seo({ keyphrase: '' })
    expect(statusOf(checks, 'keyphrase-set')).toBe('bad')
    expect(checks.some((c) => c.id === 'keyphrase-in-title')).toBe(false)
  })

  it('finds the keyphrase in the title, using the meta title first', () => {
    expect(statusOf(seo({}), 'keyphrase-in-title')).toBe('good')
    expect(statusOf(seo({ metaTitle: 'Choosing gear for every runner' }), 'keyphrase-in-title')).toBe('bad')
  })

  it('finds the keyphrase in the meta description', () => {
    expect(statusOf(seo({}), 'keyphrase-in-meta')).toBe('good')
    expect(statusOf(seo({ metaDescription: 'Gear for everyone' }), 'keyphrase-in-meta')).toBe('bad')
  })

  it('finds the keyphrase in the web address', () => {
    expect(statusOf(seo({}), 'keyphrase-in-slug')).toBe('good')
    expect(statusOf(seo({ slug: 'gear-guide' }), 'keyphrase-in-slug')).toBe('bad')
  })

  it('looks for the keyphrase only in the first paragraph', () => {
    expect(statusOf(seo({ text: 'Running shoes matter.\n\nLater text.' }), 'keyphrase-in-intro')).toBe('good')
    expect(statusOf(seo({ text: 'Gear matters.\n\nRunning shoes later.' }), 'keyphrase-in-intro')).toBe('bad')
  })

  it('wants the keyphrase in an h2 or h3, not a deeper heading', () => {
    expect(statusOf(seo({ headings: [{ level: 2, text: 'Running shoes' }] }), 'keyphrase-in-subheading')).toBe('good')
    expect(statusOf(seo({ headings: [{ level: 3, text: 'Pick running shoes' }] }), 'keyphrase-in-subheading')).toBe('good')
    expect(statusOf(seo({ headings: [{ level: 4, text: 'Running shoes' }] }), 'keyphrase-in-subheading')).toBe('ok')
  })

  it('reads keyphrase density at the 0.5% and 3% edges', () => {
    const density = (text: string) => find(seo({ keyphrase: 'shoe', text }), 'keyphrase-density')
    expect(density('shoe ' + 'other '.repeat(99)).status).toBe('good')
    expect(density('shoe ' + 'other '.repeat(299)).status).toBe('ok')
    expect(density('shoe '.repeat(10) + 'other '.repeat(90)).status).toBe('bad')
    expect(density('shoe '.repeat(3) + 'other '.repeat(197)).status).toBe('good')
  })

  it('counts a multi-word keyphrase density in order', () => {
    const text = 'running shoes '.repeat(5) + 'other '.repeat(90)
    expect(find(seo({ text }), 'keyphrase-density').status).toBe('bad')
  })

  it('reports no density when there is no text', () => {
    expect(statusOf(seo({ text: '' }), 'keyphrase-density')).toBe('ok')
  })

  it('checks the keyphrase in image alt text', () => {
    expect(statusOf(seo({ images: [{ alt: 'Running shoes on a track' }] }), 'keyphrase-in-alt')).toBe('good')
    expect(statusOf(seo({ images: [{ alt: 'A dog' }] }), 'keyphrase-in-alt')).toBe('ok')
    expect(statusOf(seo({ images: [] }), 'keyphrase-in-alt')).toBe('info')
  })
})

describe('length checks', () => {
  it('sets text length bands at 300, 150 words', () => {
    expect(statusOf(seo({ text: 'word '.repeat(300) }), 'text-length')).toBe('good')
    expect(statusOf(seo({ text: 'word '.repeat(299) }), 'text-length')).toBe('ok')
    expect(statusOf(seo({ text: 'word '.repeat(150) }), 'text-length')).toBe('ok')
    expect(statusOf(seo({ text: 'word '.repeat(149) }), 'text-length')).toBe('bad')
  })

  it('sets title length bands at 30 and 60 characters', () => {
    const title = (n: number) => statusOf(seo({ metaTitle: 'a'.repeat(n) }), 'title-length')
    expect(title(30)).toBe('good')
    expect(title(60)).toBe('good')
    expect(title(29)).toBe('ok')
    expect(title(61)).toBe('ok')
    expect(statusOf(seo({ title: '', metaTitle: '' }), 'title-length')).toBe('bad')
  })

  it('sets meta description length bands at 120 and 160 characters', () => {
    const meta = (n: number) => statusOf(seo({ metaDescription: 'm'.repeat(n) }), 'meta-length')
    expect(meta(120)).toBe('good')
    expect(meta(160)).toBe('good')
    expect(meta(119)).toBe('ok')
    expect(meta(161)).toBe('ok')
    expect(meta(0)).toBe('bad')
  })
})

describe('link and image checks', () => {
  it('wants at least one internal link', () => {
    expect(statusOf(seo({ links: [{ href: '/about', internal: true }] }), 'internal-links')).toBe('good')
    expect(statusOf(seo({ links: [] }), 'internal-links')).toBe('ok')
  })

  it('treats a missing outbound link as info only', () => {
    expect(statusOf(seo({ links: [] }), 'outbound-links')).toBe('info')
    expect(statusOf(seo({ links: [{ href: 'https://example.com', internal: false }] }), 'outbound-links')).toBe('good')
  })

  it('checks that images have alt text', () => {
    expect(statusOf(seo({ images: [{ alt: 'a' }, { alt: 'b' }] }), 'image-alt')).toBe('good')
    expect(statusOf(seo({ images: [{ alt: 'a' }, { alt: ' ' }] }), 'image-alt')).toBe('ok')
    expect(statusOf(seo({ images: [] }), 'image-alt')).toBe('info')
  })
})

describe('readability checks', () => {
  const readable = (text: string) => readabilityChecks(text, [])
  const get = (checks: Check[], id: string) => find(checks, id).status

  it('scores reading ease: short plain sentences good, dense words bad', () => {
    expect(get(readable('The cat sat on the mat.'), 'flesch')).toBe('good')
    expect(get(readable('Notwithstanding the aforementioned considerations, interdisciplinary methodologies necessitate comprehensive reconsideration.'), 'flesch')).toBe('bad')
  })

  it('flags average sentences over 20 words', () => {
    expect(get(readable('The cat sat.'), 'avg-sentence-length')).toBe('good')
    expect(get(readable('word '.repeat(25) + 'end.'), 'avg-sentence-length')).toBe('ok')
  })

  it('flags a text where most sentences are long', () => {
    expect(get(readable('word '.repeat(25) + 'end.'), 'long-sentences')).toBe('ok')
    expect(get(readable('The cat sat. The dog ran.'), 'long-sentences')).toBe('good')
  })

  it('flags a paragraph over 150 words', () => {
    expect(get(readable('word '.repeat(151)), 'paragraph-length')).toBe('ok')
    expect(get(readable('word '.repeat(150)), 'paragraph-length')).toBe('good')
  })

  it('needs a subheading in text over 300 words', () => {
    expect(get(readabilityChecks('word '.repeat(301), []), 'subheadings')).toBe('bad')
    expect(get(readabilityChecks('word '.repeat(301), [{ level: 2, text: 'Intro' }]), 'subheadings')).toBe('good')
    expect(get(readable('word '.repeat(299)), 'subheadings')).toBe('good')
  })

  it('measures passive voice share', () => {
    expect(get(readable('The door was opened. The gate was closed.'), 'passive-voice')).toBe('ok')
    expect(get(readable('The cat sat. The dog ran.'), 'passive-voice')).toBe('good')
  })

  it('measures transition word share at 30%', () => {
    expect(get(readable('However the cat sat. Then the dog ran. Also it rained.'), 'transition-words')).toBe('good')
    expect(get(readable('The cat sat. The dog ran. The bird sang.'), 'transition-words')).toBe('ok')
  })

  it('returns info, not a score, when there is no text', () => {
    const checks = readable('')
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('info')
    expect(scoreOf(checks)).toBe('info')
  })

  it('splits sentences and estimates syllables', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?'])
    expect(syllables('table')).toBe(2)
    expect(syllables('make')).toBe(1)
    expect(syllables('the')).toBe(1)
    expect(syllables('123')).toBe(0)
  })
})

describe('scores and analyze', () => {
  it('rolls checks up to bad, then ok, then good, ignoring info', () => {
    const c = (status: Status): Check => ({ id: 'x', label: 'x', status, message: '' })
    expect(scoreOf([c('good'), c('bad')])).toBe('bad')
    expect(scoreOf([c('good'), c('ok')])).toBe('ok')
    expect(scoreOf([c('good'), c('info')])).toBe('good')
    expect(scoreOf([c('info')])).toBe('info')
    expect(scoreOf([])).toBe('info')
  })

  it('returns both scores from analyze', () => {
    const result = analyze({ ...base, keyphrase: '' })
    expect(result.seoScore).toBe('bad')
    expect(result.seo.length).toBeGreaterThan(0)
    expect(result.readability.length).toBeGreaterThan(0)
  })
})

describe('extractForAnalysis', () => {
  const doc = {
    title: 'Should be ignored',
    slug: 'ignored-slug',
    seo: { metaTitle: 'ignored', focusKeyphrase: 'ignored' },
    body: {
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Running shoes' }] },
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Hello ' },
              { type: 'link', fields: { url: '/shop' }, children: [{ type: 'text', text: 'shop' }] },
              { type: 'text', text: ' now.' },
            ],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Second' }, { type: 'linebreak' }, { type: 'text', text: 'line.' }],
          },
          { type: 'list', children: [{ type: 'listitem', children: [{ type: 'text', text: 'Item one' }] }] },
          { type: 'paragraph', children: [{ type: 'upload', value: { alt: 'A red shoe', mimeType: 'image/jpeg' } }] },
        ],
      },
    },
    blocks: [
      {
        blockType: 'hero',
        heading: 'Hero title',
        subheading: 'Hero sub',
        primaryCtaLabel: 'Buy',
        primaryCtaUrl: 'https://example.com/buy',
      },
      { blockType: 'faq', items: [{ question: 'Q?', answer: 'A.' }] },
      { blockType: 'heading', text: 'Block heading', level: 3 },
      { blockType: 'gallery', items: [{ mimeType: 'image/png', alt: 'Gallery pic', url: '/media/g.png' }] },
    ],
  }

  it('reads paragraphs from rich text and blocks, in reading order', () => {
    const { text } = extractForAnalysis(doc)
    expect(text.split('\n\n')).toEqual([
      'Hello shop now.',
      'Second line.',
      'Item one',
      'Hero title',
      'Hero sub',
      'Buy',
      'Q?',
      'A.',
    ])
    expect(text).not.toContain('Should be ignored')
  })

  it('reads headings from rich text and heading blocks', () => {
    const { headings } = extractForAnalysis(doc)
    expect(headings).toEqual([
      { level: 2, text: 'Running shoes' },
      { level: 3, text: 'Block heading' },
    ])
  })

  it('reads links and marks relative ones internal', () => {
    const { links } = extractForAnalysis(doc)
    expect(links).toEqual([
      { href: '/shop', internal: true },
      { href: 'https://example.com/buy', internal: false },
    ])
  })

  it('reads images with their alt text, from rich text and blocks', () => {
    const { images } = extractForAnalysis(doc)
    expect(images).toEqual([{ alt: 'A red shoe' }, { alt: 'Gallery pic' }])
  })

  it('returns empty parts for an empty document', () => {
    expect(extractForAnalysis({})).toEqual({ text: '', headings: [], links: [], images: [] })
  })
})
