import React from 'react'

import { getBlockContext } from '@/lib/blockContext'
import { getEngine } from '@/lib/engine'

import { getMultilingualSettings, localisedHref, localeNativeName } from '@/features/multilingual'
import { availableLocalesForPath } from '@/features/multilingual/applyTranslations'
import { localizedPathsFor } from '@/features/multilingual/slugIndex'
import { localesFor } from '@/features/seo/localeSeo'
import { requestContentLocale } from '@/features/multilingual/portalLocaleServer'

import { mediaOf, str } from './elementUtil'
import './wave65.css'

/** Wave 65 server elements (defs: src/lib/elements/wave65Defs.ts). Public data only; failures render nothing. */

type P = Record<string, unknown>
type Neighbour = { title: string; href: string }

export async function AuthorBoxElement(props: P): Promise<React.ReactElement | null> {
  const name = str(props.name).trim() || str(getBlockContext().post?.author).trim()
  const bio = str(props.bio).trim()
  const avatar = mediaOf(props.avatarUrl)
  if (!name && !bio) return null
  return (
    <aside className="be-el-65-author">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatar?.url ? <img src={avatar.url} alt="" /> : null}
      <div>
        {str(props.label) ? <p className="be-el-65-author__label">{str(props.label)}</p> : null}
        {name ? <p className="be-el-65-author__name">{name}</p> : null}
        {bio ? <p className="be-el-65-author__bio">{bio}</p> : null}
      </div>
    </aside>
  )
}

/** The blog slug from a /blog/<slug> path, or ''. */
export const blogSlug = (path: unknown): string => {
  const m = /^\/blog\/([^/?#]+)\/?$/.exec(typeof path === 'string' ? path : '')
  return m ? m[1] : ''
}

async function neighbour(date: string, dir: 'prev' | 'next'): Promise<Neighbour | null> {
  try {
    const engine = await getEngine()
    const r = (await engine.find({
      collection: 'posts',
      where: { and: [{ _status: { equals: 'published' } }, { publishedDate: dir === 'prev' ? { less_than: date } : { greater_than: date } }] },
      sort: dir === 'prev' ? '-publishedDate' : 'publishedDate',
      limit: 1, depth: 0,
    } as never)) as unknown as { docs?: { title?: unknown; slug?: unknown }[] }
    const d = r?.docs?.[0]
    return d && str(d.slug) ? { title: str(d.title) || str(d.slug), href: `/blog/${encodeURIComponent(str(d.slug))}` } : null
  } catch {
    return null
  }
}

export async function PostNavigationElement(props: P): Promise<React.ReactElement | null> {
  const ctx = getBlockContext()
  const date = typeof ctx.post?.date === 'string' ? ctx.post.date : ''
  if (!blogSlug(ctx.path) || !date) return null
  const [prev, next] = await Promise.all([neighbour(date, 'prev'), neighbour(date, 'next')])
  if (!prev && !next) return null
  const link = (n: Neighbour | null, cls: string, label: string) =>
    n ? <a className={cls} href={n.href} rel={cls.endsWith('next') ? 'next' : 'prev'}><small>{label}</small>{n.title}</a> : null
  return (
    <nav className="be-el-65-postnav" aria-label="Post navigation">
      {link(prev, 'be-el-65-postnav__prev', str(props.prevLabel) || 'Previous post')}
      {link(next, 'be-el-65-postnav__next', str(props.nextLabel) || 'Next post')}
    </nav>
  )
}

async function languageData() {
  try {
    const settings = await getMultilingualSettings((await getEngine()) as never)
    if (!settings.enabled || settings.activeLocales.length < 2) return null
    // The middleware strips the locale prefix, so the path is the page and the header carries the language.
    const current = (await requestContentLocale(settings)) ?? settings.defaultLocale
    const rest = getBlockContext().path || '/'
    // Languages this page has no publishable translation in are left out, the default always stays.
    const offered = localesFor(settings, await availableLocalesForPath(rest))
    // Each language's own URL for this page: a translated slug where there is one (localizedSlugs.ts).
    const paths = (await localizedPathsFor(rest)) ?? {}
    return { settings, rest, current, offered, paths }
  } catch {
    return null
  }
}

export async function LanguageSwitcherElement(props: P): Promise<React.ReactElement | null> {
  const d = await languageData()
  if (!d) return null
  return (
    <nav aria-label={str(props.label) || 'Language'}>
      <ul className="be-el-65-lang">
        {d.offered.map((code) => (
          <li key={code}>
            <a href={localisedHref(d.paths[code] ?? d.rest, code, d.settings)} hrefLang={code} lang={code} aria-current={code === d.current ? 'true' : undefined}>{localeNativeName(code)}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const WAVE65_SERVER_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'author-box': AuthorBoxElement as never,
  'post-navigation': PostNavigationElement as never,
  'language-switcher': LanguageSwitcherElement as never,
}
