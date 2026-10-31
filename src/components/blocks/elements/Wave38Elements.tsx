/* eslint-disable @next/next/no-img-element */
import { requestDomain } from '@/features/domains/request'
import { domainTagline } from '@/features/domains/brand'
import Link from 'next/link'
import React from 'react'

import { getAllResolvedPages } from '@/utilities/pagePaths'
import { getFeatureFlags } from '@/utilities/features'
import { orderBlogPosts } from '@/features/editScreens/blogOrder'
import { getEngine } from '@/lib/engine'

import { flag, linkHref, mediaOf, num, pick, str } from './elementUtil'
import { LoopElement } from './Wave50Server'
import { WAVE63_COMPONENTS } from './Wave63Server'
import { LoopGridElement } from './LoopGridServer'
import { ArchiveFilterElement } from './ArchiveFilter'
import { WAVE65_SERVER_COMPONENTS } from './Wave65Server'
import { WAVE66_COMPONENTS } from './Wave66Server'
import { WAVE67_COMPONENTS } from './Wave67Server'
import { EMBED_CODE_COMPONENTS } from './EmbedCodeServer'
import { TEMPLATE_PART_COMPONENTS } from './TemplatePartServer'
import { DynamicTextElement } from './DynamicText'
import SearchSuggest from './SearchSuggest'
import './wave38.css'
import './navMenu.css'

/**
 * Wave 38 renderers: site elements that read live site data on the server. Each renderer is an async server
 * component with no client JS. Defs live in src/lib/elements/wave38Defs.ts.
 *
 * These are NOT registered in elementComponents.tsx. That table is imported by renderElement, which the editor canvas
 * (a client component) also imports, and this module reaches the engine. They are dispatched from BlockRenderer
 * (server only) through <SiteElement>, and the canvas shows a placeholder instead (CanvasBlockPreview).
 *
 * Every read is wrapped in try/catch. When the data is missing or unreadable the element renders nothing.
 */

type P = Record<string, unknown>

/* ---------- site settings ---------- */

type SiteRead = { siteName: string; tagline: string; logo: { url: string; width: number; height: number } | null }

const positive = (v: unknown): number => (typeof v === 'number' && v > 0 ? v : 0)

/** Name, tagline and logo from Settings > General (site-settings). Empty values when unreadable. */
async function readSite(): Promise<SiteRead> {
  const empty: SiteRead = { siteName: '', tagline: '', logo: null }
  try {
    const engine = await getEngine()
    const doc = (await engine.findGlobal({ slug: 'site-settings', depth: 1 })) as unknown as { siteName?: unknown; tagline?: unknown; logo?: unknown } | null
    if (!doc) return empty
    const media = mediaOf(doc.logo)
    const raw = doc.logo && typeof doc.logo === 'object' ? (doc.logo as { width?: unknown; height?: unknown }) : {}
    // On a registered domain its own name, tagline and logo replace the site-wide ones where it sets them.
    const domain = await requestDomain()
    const tagline = domainTagline(str(doc.tagline).trim(), domain)
    const domainLogo = domain?.overrides.logoUrl
    return {
      siteName: domain?.overrides.siteName || str(doc.siteName).trim(),
      tagline,
      logo: domainLogo
        ? { url: domainLogo, width: 0, height: 0 }
        : media?.url ? { url: media.url, width: positive(raw.width), height: positive(raw.height) } : null,
    }
  } catch {
    return empty
  }
}

/* ---------- site logo ---------- */

/**
 * `site-logo`: the logo image with width and height attributes from the stored media (or a 4:1 box when the size is
 * unknown), so the page does not jump when it loads. With no logo, the site name is shown as text. Always links to /.
 */
export const SiteLogoElement: React.FC<P> = async (p) => {
  const width = Math.round(num(p.width, 160, 40, 400))
  const site = await readSite()
  if (!site.logo && !site.siteName) return null
  const alt = str(p.alt).trim() || site.siteName
  const inner = site.logo ? (
    <img
      className="be-el-logo__img"
      src={site.logo.url}
      alt={alt}
      width={width}
      height={Math.max(1, Math.round(width * (site.logo.width > 0 && site.logo.height > 0 ? site.logo.height / site.logo.width : 0.25)))}
    />
  ) : (
    <span className="be-el-logo__text">{site.siteName}</span>
  )
  return (
    <Link className="be-el-logo" href="/">
      {inner}
    </Link>
  )
}

/* ---------- site title ---------- */

/** `site-title`: the site name in the chosen heading level (or paragraph), with the tagline in a paragraph under it. */
export const SiteTitleElement: React.FC<P> = async (p) => {
  const site = await readSite()
  const showTagline = flag(p.showTagline, true)
  const tagline = showTagline ? site.tagline : ''
  if (!site.siteName && !tagline) return null
  const tag = pick(p.tag, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'] as const, 'p')
  return (
    <div className="be-el-site-title">
      {site.siteName && React.createElement(tag, { className: 'be-el-site-title__name' }, site.siteName)}
      {tagline && <p className="be-el-site-title__tagline">{tagline}</p>}
    </div>
  )
}

/* ---------- menu ---------- */

type LinkRow = {
  label?: string | null
  linkType?: string | null
  page?: unknown
  customUrl?: string | null
  openInNewTab?: boolean | null
  children?: LinkRow[] | null
}
type NavItem = { href: string | null; label: string; newTab: boolean; children: NavItem[] }
type ResolvedRow = { page: { id?: unknown; isHomepage?: boolean | null }; path: string[] }

/**
 * The Header menu (one list, no named menus), resolved the way the public header resolves it: page links become
 * their path, links to features that are switched off are dropped, and dropdowns go two levels deep. Empty when
 * unreadable.
 */
async function readMenu(): Promise<NavItem[]> {
  try {
    const engine = await getEngine()
    const [header, settings, pages] = (await Promise.all([
      engine.findGlobal({ slug: 'header', depth: 1 }).catch((): null => null),
      engine.findGlobal({ slug: 'site-settings', depth: 1 }).catch((): null => null),
      getAllResolvedPages().catch((): ResolvedRow[] => []),
    ])) as unknown as [{ menu?: LinkRow[] | null } | null, { features?: Record<string, unknown> } | null, ResolvedRow[]]

    const features = settings?.features
    const off = (key: string) => features?.[key] === false
    const disabled = [
      ...(off('ecommerce') ? ['/shop', '/cart'] : []),
      ...(off('events') ? ['/events'] : []),
      ...(off('blog') ? ['/blog'] : []),
      ...(off('faq') ? ['/faq'] : []),
    ]
    const isAllowed = (href: string) => !disabled.some((prefix) => href === prefix || href.startsWith(`${prefix}/`))
    const pathById = new Map(pages.map((entry) => [String(entry.page.id), entry]))

    const hrefOf = (row: LinkRow): string | null => {
      if (row.linkType === 'page') {
        const id = row.page && typeof row.page === 'object' ? (row.page as { id?: unknown }).id : row.page
        if (!id) return null
        const entry = pathById.get(String(id))
        if (!entry) return null
        return entry.page.isHomepage ? '/' : `/${entry.path.join('/')}`
      }
      return linkHref(row.customUrl) || null
    }

    const build = (rows: LinkRow[] | null | undefined, depth: number): NavItem[] =>
      (rows || []).flatMap((row): NavItem[] => {
        const label = str(row.label).trim()
        if (!label) return []
        const href = hrefOf(row)
        if (href !== null && !isAllowed(href)) return []
        const children = depth > 0 ? build(row.children, depth - 1) : []
        // A parent with no link of its own still shows, as long as it has items to open.
        if (href === null && children.length === 0) return []
        return [{ href, label, newTab: flag(row.openInNewTab, false), children }]
      })

    return build(header?.menu, 1)
  } catch {
    return []
  }
}

const NavAnchor: React.FC<{ item: NavItem; className: string }> = ({ item, className }) =>
  item.href ? (
    <a className={className} href={item.href} {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {item.label}
    </a>
  ) : (
    <span className={className}>{item.label}</span>
  )

/**
 * `nav-menu`: the Header menu as <nav><ul><li>. A parent with items gets a nested <ul>. It opens on hover, and also
 * when a key moves focus into its item (the :focus-within rule in wave38.css), so the sub-links are reachable by
 * keyboard.
 *
 * Options (all optional; old pages have none of them and render as before):
 * - mobileBreakpoint: below 768px or 1024px the desktop list hides and a <details> Menu button shows instead. The
 *   button is a native summary, so its open state is exposed to assistive tech as aria-expanded with no script.
 *   The mobile list is a second copy of the links; CSS shows exactly one of the two at any width.
 * - mobileStyle: the mobile panel drops under the button, or slides in as a fixed panel from the right.
 * - submenuStyle: "mega" opens the sub-links as a column grid across the bar (horizontal menus only).
 * - sticky: the bar stays at the top while scrolling.
 * - onePage: enables smooth scrolling for #anchor links on pages that contain this menu (see navMenu.css).
 */
export const NavMenuElement: React.FC<P> = async (p) => {
  const items = await readMenu()
  if (items.length === 0) return null
  const vertical = pick(p.layout, ['horizontal', 'vertical'] as const, 'horizontal') === 'vertical'
  const label = str(p.label).trim() || 'Main menu'
  const breakpoint = pick(p.mobileBreakpoint, ['never', '768', '1024'] as const, 'never')
  const mobileStyle = pick(p.mobileStyle, ['hamburger-dropdown', 'offcanvas'] as const, 'hamburger-dropdown')
  const submenu = pick(p.submenuStyle, ['dropdown', 'mega'] as const, 'dropdown')
  const classes = [
    'be-el-nav',
    `be-el-nav--${vertical ? 'vertical' : 'horizontal'}`,
    submenu === 'mega' && !vertical ? 'be-el-nav--mega' : '',
    breakpoint !== 'never' ? `be-el-nav--bp-${breakpoint}` : '',
    breakpoint !== 'never' ? `be-el-nav--${mobileStyle}` : '',
    flag(p.sticky) ? 'be-el-nav--sticky' : '',
    flag(p.onePage) ? 'be-el-nav--one-page' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const list = (mobile: boolean) => (
    <ul className={`be-el-nav__list ${mobile ? 'be-el-nav__list--mobile' : 'be-el-nav__list--desktop'}`}>
      {items.map((item, i) => (
        <li key={i} className={`be-el-nav__item${item.children.length > 0 ? ' be-el-nav__item--has-children' : ''}`}>
          <NavAnchor item={item} className="be-el-nav__link" />
          {item.children.length > 0 && (
            <ul className="be-el-nav__sub">
              {item.children.map((child, j) => (
                <li key={j} className="be-el-nav__sub-item">
                  <NavAnchor item={child} className="be-el-nav__sub-link" />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <nav className={classes} aria-label={label}>
      {list(false)}
      {breakpoint !== 'never' && (
        <details className="be-el-nav__mobile">
          <summary className="be-el-nav__burger">
            <span className="be-el-nav__bars" aria-hidden="true" />
            <span className="be-el-nav__burger-text">Menu</span>
          </summary>
          {list(true)}
        </details>
      )}
    </nav>
  )
}

/* ---------- search box ---------- */

/**
 * `search-box`: a GET form that submits to /search?q= (works without JS). With liveResults on, a client combobox adds
 * suggestions from /api/search-suggest.
 */
export const SearchBoxElement: React.FC<P> = (p) => {
  const placeholder = str(p.placeholder).trim() || 'Search'
  const button = str(p.buttonLabel).trim() || 'Search'
  if (flag(p.liveResults, true)) {
    return <SearchSuggest placeholder={placeholder} button={button} maxResults={num(p.maxResults, 6, 3, 6)} showType={flag(p.showType, true)} />
  }
  return (
    <form className="be-el-search" role="search" action="/search" method="get">
      <label className="be-el-search__field">
        <span className="be-el-search__sr">Search the site</span>
        <input className="be-el-search__input" type="search" name="q" placeholder={placeholder} autoComplete="off" enterKeyHint="search" />
      </label>
      <button className="be-el-search__btn" type="submit">
        {button}
      </button>
    </form>
  )
}

/* ---------- latest posts ---------- */

type PostRow = {
  title?: string | null
  slug?: string | null
  excerpt?: string | null
  publishedDate?: string | null
  sticky?: boolean | null
  categories?: { name?: string | null }[] | null
  featuredImage?: unknown
}

/** Published posts in blog order, the same query the blog index uses. Null when the blog is off or the read fails. */
async function readPosts(): Promise<PostRow[] | null> {
  try {
    const flags = await getFeatureFlags()
    if (!flags.blog) return null
    const engine = await getEngine()
    const { docs } = (await engine.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      sort: '-publishedDate',
      limit: 0,
      depth: 1,
    })) as unknown as { docs: PostRow[] }
    return orderBlogPosts(docs)
  } catch {
    return null
  }
}

const IMAGE_W = 640
const IMAGE_H = 420

/** A featured image with the size to print it at: 640 wide, height from the stored ratio (420 when unknown). */
function imageOf(v: unknown): { url: string; alt: string | null; height: number } | null {
  const media = mediaOf(v)
  if (!media?.url) return null
  const raw = (v && typeof v === 'object' ? v : {}) as { width?: unknown; height?: unknown }
  const w = positive(raw.width)
  const h = positive(raw.height)
  return { url: media.url, alt: media.alt ?? null, height: w > 0 && h > 0 ? Math.round((IMAGE_W * h) / w) : IMAGE_H }
}

function dateOf(v: string | null | undefined): { iso: string; label: string } | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return { iso: d.toISOString(), label: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

/**
 * `post-list`: the newest published posts (sticky first), optionally one category, as <ul> of <article>s with a
 * heading and a link to each post. Renders nothing when the blog is off or there are no matching posts.
 */
export const PostListElement: React.FC<P> = async (p) => {
  const count = Math.round(num(p.count, 3, 1, 12))
  const category = str(p.category).trim().toLowerCase()
  const layout = pick(p.layout, ['grid', 'list'] as const, 'grid')
  const Heading = pick(p.headingTag, ['h2', 'h3', 'h4'] as const, 'h3')
  const showImage = flag(p.showImage, true)
  const showExcerpt = flag(p.showExcerpt, true)
  const showDate = flag(p.showDate, true)

  const all = await readPosts()
  if (!all) return null
  const rows = all.flatMap((post) => {
    if (!post.title || !post.slug) return []
    if (category && !(post.categories || []).some((c) => str(c.name).trim().toLowerCase() === category)) return []
    return [{ post, title: post.title, slug: post.slug }]
  })
  const list = rows.slice(0, count)
  if (list.length === 0) return null

  return (
    <ul className={`be-el-posts be-el-posts--${layout}`}>
      {list.map(({ post, title, slug }) => {
        const image = showImage ? imageOf(post.featuredImage) : null
        const date = showDate ? dateOf(post.publishedDate) : null
        const excerpt = showExcerpt ? str(post.excerpt).trim() : ''
        return (
          <li key={slug} className="be-el-posts__entry">
            <article className="be-el-posts__item">
              {image && (
                <img className="be-el-posts__image" src={image.url} alt={image.alt || title} width={IMAGE_W} height={image.height} loading="lazy" decoding="async" />
              )}
              {React.createElement(Heading, { className: 'be-el-posts__title' }, <a href={`/blog/${encodeURIComponent(slug)}`}>{title}</a>)}
              {date && (
                <time className="be-el-posts__date" dateTime={date.iso}>
                  {date.label}
                </time>
              )}
              {excerpt && <p className="be-el-posts__excerpt">{excerpt}</p>}
            </article>
          </li>
        )
      })}
    </ul>
  )
}

/* ---------- dispatch ---------- */

/** The site renderers, keyed by element type. Only SiteElement below reads this table. */
const SITE_RENDERERS: Record<string, React.ComponentType<P>> = {
  'site-logo': SiteLogoElement,
  'site-title': SiteTitleElement,
  'nav-menu': NavMenuElement,
  'search-box': SearchBoxElement,
  'post-list': PostListElement,
  loop: LoopElement,
  'dynamic-text': DynamicTextElement,
  ...WAVE63_COMPONENTS,
  'loop-grid': LoopGridElement as unknown as React.ComponentType<P>,
  'archive-filter': ArchiveFilterElement as unknown as React.ComponentType<P>,
  ...WAVE65_SERVER_COMPONENTS,
  ...WAVE66_COMPONENTS,
  ...WAVE67_COMPONENTS,
  ...EMBED_CODE_COMPONENTS,
  ...TEMPLATE_PART_COMPONENTS,
}

/**
 * Entry point used by BlockRenderer for the site element types. Applies the element's Design wrapper the same way
 * renderElement does for every other element.
 */
export const SiteElement: React.FC<{ elementType: string; props: P }> = ({ elementType, props }) => {
  const Renderer = SITE_RENDERERS[elementType]
  return Renderer ? <Renderer {...props} /> : null
}
