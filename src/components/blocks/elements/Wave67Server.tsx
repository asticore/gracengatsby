import React from 'react'

import { getEngine } from '@/lib/engine'
import { SOCIAL_FEED_LIMIT } from '@/lib/elements/wave67Defs'
import { getFeed, readSocialAccounts } from '@/features/socialFeeds/service'
import type { SocialPost } from '@/features/socialFeeds/types'

import { flag, num, pick, str } from './elementUtil'
import './social-feed.css'

/**
 * Wave 67 social feed (def: src/lib/elements/wave67Defs.ts). Server rendered from a connected account. The output
 * depends only on the saved props and the cached posts, so it is identical for every visitor and safe to edge cache.
 * No token ever reaches this markup. Failures render nothing.
 */

type P = Record<string, unknown>

const LAYOUTS = ['grid', 'list', 'carousel'] as const
const ASPECTS = ['square', 'portrait', 'landscape'] as const

/** A fixed, locale independent date so every visitor sees the same text. */
export const feedDate = (iso: string): string => (iso ? iso.slice(0, 10) : '')

export function SocialFeedView({ posts, props }: { posts: SocialPost[]; props: P }): React.ReactElement | null {
  const layout = pick(props.layout, LAYOUTS, 'grid')
  const aspect = pick(props.aspect, ASPECTS, 'square')
  const columns = Math.round(num(props.columns, 3, 1, 6))
  const limit = Math.round(num(props.limit, 9, 1, SOCIAL_FEED_LIMIT))
  const showCaption = flag(props.showCaption, true)
  const showDate = flag(props.showDate, false)
  const showLikes = flag(props.showLikes, false)
  const newTab = flag(props.newTab, true)
  const shown = posts.slice(0, limit)
  if (!shown.length) return null
  const rel = newTab ? 'noopener noreferrer' : 'noopener'
  return (
    <ul className={`be-social-feed be-social-feed--${layout} be-social-feed--${aspect}`} style={{ '--be-social-cols': columns } as React.CSSProperties}>
      {shown.map((p) => (
        <li key={p.id || p.url} className="be-social-feed__item">
          <a className="be-social-feed__card" href={p.url} target={newTab ? '_blank' : undefined} rel={rel}>
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="be-social-feed__img" src={p.imageUrl} alt={p.caption.slice(0, 100)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            ) : (
              <span className="be-social-feed__img be-social-feed__img--empty" aria-hidden="true" />
            )}
            {showCaption && p.caption ? <span className="be-social-feed__caption">{p.caption}</span> : null}
            {(showDate && p.date) || (showLikes && p.likes !== null) ? (
              <span className="be-social-feed__meta">
                {showDate && p.date ? <time dateTime={p.date}>{feedDate(p.date)}</time> : null}
                {showLikes && p.likes !== null ? <span>{`${p.likes} likes`}</span> : null}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  )
}

export async function SocialFeedElement(props: P): Promise<React.ReactElement | null> {
  const wanted = str(props.account)
  if (!wanted) return null
  let posts: SocialPost[] = []
  try {
    const engine = await getEngine()
    const accounts = await readSocialAccounts(engine as never)
    const account = accounts.find((a) => a.id === wanted)
    if (!account) return null
    posts = await getFeed(account)
  } catch {
    return null
  }
  return <SocialFeedView posts={posts} props={props} />
}

export const WAVE67_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'social-feed': SocialFeedElement as never,
}
