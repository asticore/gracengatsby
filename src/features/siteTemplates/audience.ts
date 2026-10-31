import { cache } from 'react'

import { getAllResolvedPages } from '@/utilities/pagePaths'

/**
 * Who the visitor is for template audiences: `members` when a customer is signed in, `guests` otherwise. Read once
 * per request. Falls back to `guests` when the session cannot be read (no request scope, a database problem), so a
 * member-only template is never shown by mistake.
 */
export const currentAudience = cache(async (): Promise<'members' | 'guests'> => {
  try {
    // Loaded on demand: the account feature is heavy and only needed when a template is limited to an audience.
    const { accountContext } = await import('@/features/accounts/session')
    const { user } = await accountContext()
    return user ? 'members' : 'guests'
  } catch {
    return 'guests'
  }
})

/** The address a page answers at (`/` for the homepage), as the public layout builds it. */
const addressOf = (entry: { page: { isHomepage?: boolean | null }; path: string[] }): string => (entry.page.isHomepage ? '/' : `/${entry.path.join('/')}`)

/** A request path without its query, trailing slash or leading locale segment, for comparing with page addresses. */
export const normalisePagePath = (path: string, activeLocales: string[] = []): string => {
  const bare = path.split(/[?#]/)[0] || '/'
  const [, first = '', ...rest] = bare.split('/')
  const withoutLocale = activeLocales.some((code) => code.toLowerCase() === first.toLowerCase()) ? `/${rest.join('/')}` : bare
  const trimmed = withoutLocale.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** The id of the published page this path answers at, as a string, or null when no page does. Never throws. */
export const pageIdForPath = cache(async (path: string): Promise<string | null> => {
  try {
    const wanted = normalisePagePath(path)
    const entries = await getAllResolvedPages()
    const hit = entries.find((entry) => addressOf(entry) === wanted)
    return hit ? String(hit.page.id) : null
  } catch {
    return null
  }
})
