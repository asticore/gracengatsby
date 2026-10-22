import { describe, expect, it } from 'vitest'

import { authorIndex, authorPath, publicAuthor, postsByAuthor, postsWithTag, tagIndex, tagPath } from '@/features/siteTemplates/archiveQueries'
import { postAuthorName } from '@/lib/blockContextFrom'
import { locationContextFor } from '@/features/customFields/server'
import { up as migrate } from '@/migrations/20261109_100000_blog_tags_authors'

const ann = { id: 1, email: 'ann@x.com', displayName: 'Ann Lee', slug: 'ann-lee' }
const posts = [
  { id: 1, slug: 'a', tags: [{ name: 'Rust' }, { name: 'Web Dev' }], author: ann },
  { id: 2, slug: 'b', tags: [{ name: 'rust ' }], author: { id: 2, email: 'bo@x.com' } },
  { id: 3, slug: 'c', tags: [] as Array<{ name: string }>, author: 7 },
  { id: 4, slug: 'd' },
]

describe('tag archives', () => {
  it('indexes and filters tags by slug', () => {
    expect([...tagIndex(posts)]).toEqual([['rust', 'Rust'], ['web-dev', 'Web Dev']])
    expect(postsWithTag(posts, 'rust').map((p) => p.id)).toEqual([1, 2])
    expect(postsWithTag(posts, 'nope')).toEqual([])
    expect(postsWithTag(posts, '../x')).toEqual([])
    expect(tagPath('rust')).toBe('/blog/tag/rust')
    expect(tagPath('rust', 3)).toBe('/blog/tag/rust?page=3')
  })
})

describe('author archives', () => {
  it('lists only authors with a public name and slug', () => {
    expect([...authorIndex(posts)]).toEqual([['ann-lee', 'Ann Lee']])
    expect(postsByAuthor(posts, 'ann-lee').map((p) => p.id)).toEqual([1])
    expect(postsByAuthor(posts, 'Bad Slug')).toEqual([])
    expect(authorPath('ann-lee', 2)).toBe('/blog/author/ann-lee?page=2')
  })
  it('never exposes email', () => {
    expect(JSON.stringify(publicAuthor(posts[0]))).not.toContain('@')
    expect(publicAuthor(posts[1])).toBeNull()
    expect(postAuthorName(ann, 'Site')).toBe('Ann Lee')
    expect(postAuthorName({ email: 'bo@x.com' }, 'Site')).toBe('Site')
  })
})

describe('integration points', () => {
  it('feeds post tags to custom field location context', () => {
    expect(locationContextFor('posts', { tags: [{ name: 'Rust' }] }).postTags).toEqual(['Rust'])
  })
  it('migration is idempotent', async () => {
    const seen = new Set<string>(['eg_posts', '_eg_posts_v', 'eg_users'])
    const stmts: string[] = []
    const db = {
      all: async (q: { queryChunks?: unknown[] }) => {
        const text = JSON.stringify(q)
        const hit = [...seen].some((t) => text.includes('`' + t + '`'))
        return hit ? [{ name: 'display_name' }, { name: 'slug' }] : []
      },
      run: async (q: unknown): Promise<void> => void stmts.push(JSON.stringify(q)),
    }
    await migrate({ db } as never)
    await migrate({ db } as never)
    expect(stmts.some((s) => s.includes('ADD COLUMN'))).toBe(false)
    expect(stmts.every((s) => /IF NOT EXISTS/.test(s))).toBe(true)
  })
})
