/**
 * Blog list order: sticky posts first, then newest first by publish date.
 * Posts without a usable date sink to the bottom of their group. Pure, no imports.
 */

export type BlogOrderable = {
  sticky?: boolean | null
  publishedDate?: string | null
}

function timeOf(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const time = Date.parse(value)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/** Returns a new array in blog order; the input is not changed. */
export function orderBlogPosts<T extends BlogOrderable>(posts: readonly T[]): T[] {
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => {
      const stickyA = a.post.sticky === true ? 1 : 0
      const stickyB = b.post.sticky === true ? 1 : 0
      if (stickyA !== stickyB) return stickyB - stickyA
      const timeA = timeOf(a.post.publishedDate)
      const timeB = timeOf(b.post.publishedDate)
      if (timeA !== timeB) return timeB > timeA ? 1 : -1
      return a.index - b.index
    })
    .map(({ post }) => post)
}
