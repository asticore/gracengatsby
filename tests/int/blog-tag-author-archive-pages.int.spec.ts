// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Renders the real tag and author archive pages against fixture posts. Only the database, the feature flags, the
// visibility and translation passes and the template wrapper are stand-ins: the page code and its queries are real.
const state = vi.hoisted(() => ({
  posts: [] as Array<Record<string, unknown>>,
  settings: null as Record<string, unknown> | null,
  rendered: [] as Array<{ kind: string; ctx: Record<string, unknown> }>,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => React.createElement('img', { src: props.src, alt: props.alt }),
}))

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    find: async () => ({ docs: state.posts }),
    findGlobal: async () => state.settings,
  }),
}))

vi.mock('@/utilities/features', () => ({ getFeatureFlags: async () => ({ blog: true }) }))

vi.mock('@/features/visibility/excludeProtected', () => ({ excludeProtected: async (_collection: string, docs: unknown[]) => docs }))

vi.mock('@/features/multilingual/applyTranslations', () => ({
  currentRequestLocale: async () => 'en',
  applyTranslations: async (doc: unknown) => doc,
  applyTranslationsToDocs: async (docs: unknown[]) => docs,
}))

vi.mock('@/utilities/seo', () => ({
  buildMetadata: async ({ title, path }: { title: string; path: string }) => ({ title, alternates: { canonical: path } }),
}))

vi.mock('@/features/siteTemplates/render', () => ({
  renderWithTemplate: async ({ kind, ctx, content }: { kind: string; ctx: Record<string, unknown>; content: React.ReactNode }) => {
    state.rendered.push({ kind, ctx })
    return content
  },
}))

const author = (displayName: string, slug: string) => ({ displayName, slug })
const post = (id: number, slug: string, extra: Record<string, unknown>) => ({
  id,
  slug,
  title: `Post ${id}`,
  excerpt: `Excerpt ${id}`,
  publishedDate: `2026-10-${String(id).padStart(2, '0')}T00:00:00.000Z`,
  _status: 'published',
  tags: [] as Array<{ name: string }>,
  author: null as unknown,
  ...extra,
})

/** Fixture: three posts with tags, two authors (one post has no author), one unpublished-looking extra post. */
const fixture = () => [
  post(3, 'silver-care', { tags: [{ name: 'Silver' }, { name: 'Care' }], author: author('Grace Gatsby', 'grace') }),
  post(2, 'gold-guide', { tags: [{ name: 'Gold' }], author: author('Grace Gatsby', 'grace') }),
  post(1, 'silver-history', { tags: [{ name: 'Silver' }], author: author('Ada Smith', 'ada-smith') }),
  post(4, 'no-author', { tags: [{ name: 'Care' }], author: null }),
]

async function render(modulePath: 'tag' | 'author', slug: string, query: Record<string, string> = {}) {
  const mod = modulePath === 'tag' ? await import('@/app/(frontend)/blog/tag/[slug]/page') : await import('@/app/(frontend)/blog/author/[slug]/page')
  const params = Promise.resolve({ slug })
  const searchParams = Promise.resolve(query)
  const Page = mod.default as (props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) => Promise<React.ReactElement>
  const element = await Page({ params, searchParams })
  return renderToStaticMarkup(element)
}

const titlesIn = (markup: string) => [...markup.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1])

beforeEach(() => {
  state.posts = fixture()
  state.settings = { postsPerPage: 9, archiveLayout: 'grid', showTags: true, showAuthors: true, authorArchives: true }
  state.rendered = []
})

describe('tag archive page', () => {
  it('lists only the posts with that tag, newest first, under the tag name', async () => {
    const markup = await render('tag', 'silver')
    expect(markup).toContain('<h1>Silver</h1>')
    expect(titlesIn(markup)).toEqual(['Post 3', 'Post 1'])
    expect(markup).not.toContain('Post 2')
  })

  it('wraps the page in the archive-tag site template with the tag as the post tag', async () => {
    await render('tag', 'care')
    expect(state.rendered).toHaveLength(1)
    expect(state.rendered[0]).toMatchObject({ kind: 'archive-tag', ctx: { path: '/blog/tag/care', postTags: ['Care'] } })
  })

  it('is not found for a tag no post uses, and for an unsafe slug', async () => {
    await expect(render('tag', 'bronze')).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(render('tag', '../etc')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('is not found when tags are switched off in Blog settings', async () => {
    state.settings = { ...state.settings, showTags: false }
    await expect(render('tag', 'silver')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('pages the posts with the Blog settings page size and links to the next page', async () => {
    state.settings = { ...state.settings, postsPerPage: 1 }
    const first = await render('tag', 'silver')
    expect(titlesIn(first)).toEqual(['Post 3'])
    expect(first).toContain('Page 1 of 2')
    expect(first).toContain('href="/blog/tag/silver?page=2"')
    const second = await render('tag', 'silver', { page: '2' })
    expect(titlesIn(second)).toEqual(['Post 1'])
    expect(second).toContain('Page 2 of 2')
  })
})

describe('author archive page', () => {
  it('lists only the posts by that author, under the author name', async () => {
    const markup = await render('author', 'grace')
    expect(markup).toContain('<h1>Grace Gatsby</h1>')
    expect(titlesIn(markup)).toEqual(['Post 3', 'Post 2'])
    expect(markup).not.toContain('Post 1')
  })

  it('wraps the page in the archive-author site template with the author path', async () => {
    await render('author', 'ada-smith')
    expect(state.rendered[0]).toMatchObject({ kind: 'archive-author', ctx: { path: '/blog/author/ada-smith' } })
  })

  it('never shows a post without a public author, and never shows an email address', async () => {
    state.posts = [post(5, 'x', { author: { displayName: 'Only Name', slug: 'only', email: 'secret@example.com' } })]
    const markup = await render('author', 'only')
    expect(titlesIn(markup)).toEqual(['Post 5'])
    expect(markup).not.toContain('secret@example.com')
  })

  it('is not found for an unknown author slug', async () => {
    await expect(render('author', 'nobody')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('is not found when author archives are switched off', async () => {
    state.settings = { ...state.settings, authorArchives: false }
    await expect(render('author', 'grace')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('is not found when authors are switched off, even with archives on', async () => {
    state.settings = { ...state.settings, showAuthors: false }
    await expect(render('author', 'grace')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
