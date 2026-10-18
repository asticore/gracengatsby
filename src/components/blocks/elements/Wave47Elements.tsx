/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { iconName, linkAttrs, linkHref, mediaOf, num, pick, str } from './elementUtil'
import { Icon } from './icons'
import './wave47.css'

/**
 * Wave 47 renderer: the Card element (src/lib/elements/wave47Defs.ts). Server-safe, no client JS. Motion is CSS only
 * (wave47.css) and every transform or transition sits inside a prefers-reduced-motion: no-preference guard.
 *
 * Flip: both faces are in the markup and stay readable. The back face is turned away with CSS, not hidden from
 * assistive tech. Without motion the back face sits below the front. The whole card is one link when a link is set,
 * so no other link goes inside it. Text reaches React as children, so it is escaped; colours pass a strict pattern.
 */

type P = Record<string, unknown>
type Style = React.CSSProperties

/** A colour the CSS can take as-is: hex, rgb(...) or hsl(...). Anything else is dropped (''). */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
const colorOf = (v: unknown): string => {
  const s = str(v).trim()
  return COLOR_RE.test(s) ? s : ''
}

/** Relative brightness (0 dark to 1 light) of a hex or rgb() colour, or null for any other form. */
function brightness(c: string): number | null {
  let rgb: number[] | null = null
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1]
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  } else {
    const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(c)
    if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  return rgb ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : null
}

/** Background for a face, with dark or light text picked to match it. Empty when there is no usable colour. */
const faceStyle = (bg: string): Style => {
  if (!bg) return {}
  const b = brightness(bg)
  return b === null ? { background: bg } : { background: bg, color: b > 0.6 ? '#1a1a1a' : '#ffffff' }
}

const TITLE_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6', 'p'] as const
type TitleTag = (typeof TITLE_TAGS)[number]

/** The title at the chosen tag. Written out per tag so each one is a static element, not a tag picked during render. */
const Title: React.FC<{ tag: TitleTag; children: React.ReactNode }> = ({ tag, children }) => {
  const className = 'be-el-47-card__title'
  switch (tag) {
    case 'h2':
      return <h2 className={className}>{children}</h2>
    case 'h4':
      return <h4 className={className}>{children}</h4>
    case 'h5':
      return <h5 className={className}>{children}</h5>
    case 'h6':
      return <h6 className={className}>{children}</h6>
    case 'p':
      return <p className={className}>{children}</p>
    default:
      return <h3 className={className}>{children}</h3>
  }
}

/** Aspect ratios the defs offer. "auto" keeps the picture's own shape. */
const RATIO_CSS: Record<string, string> = { '1:1': '1 / 1', '4:3': '4 / 3', '16:9': '16 / 9' }

/**
 * `card`: media (icon or picture), title, text and an optional link, in top, left or right layout. The hover
 * effect is lift, zoom-image or flip. Renders nothing when there is no content to show.
 */
export const CardElement: React.FC<P> = (p) => {
  const title = str(p.title).trim()
  const text = str(p.text).trim()
  const media = pick(p.media, ['none', 'icon', 'image'] as const, 'none')
  const image = media === 'image' ? mediaOf(p.image) : null
  const href = linkHref(p.link)
  const linkLabel = str(p.linkLabel).trim()
  const backTitle = str(p.backTitle).trim()
  const backText = str(p.backText).trim()
  const hover = pick(p.hoverEffect, ['none', 'lift', 'zoom-image', 'flip'] as const, 'none')
  // A flip with nothing on the back would turn over onto an empty face, so it falls back to no effect.
  const flip = hover === 'flip' && Boolean(backTitle || backText)
  const effect = hover === 'flip' && !flip ? 'none' : hover

  const hasFront = Boolean(title || text || image?.url || media === 'icon' || (href && linkLabel))
  if (!hasFront && !flip) return null

  const layout = pick(p.layout, ['top', 'left', 'right'] as const, 'top')
  const align = pick(p.align, ['left', 'centre'] as const, 'left')
  const shadow = pick(p.shadow, ['none', 'sm', 'md', 'lg'] as const, 'sm')
  const ratio = pick(p.imageRatio, ['auto', '1:1', '4:3', '16:9'] as const, '16:9')
  const fit = pick(p.imageFit, ['cover', 'contain'] as const, 'cover')
  const titleTag = pick(p.titleTag, TITLE_TAGS, 'h3')
  const radius = num(p.borderRadius, 8, 0, 40)

  let mediaNode: React.ReactNode = null
  if (media === 'icon') {
    const iconColour = colorOf(p.iconColour)
    mediaNode = (
      <div className="be-el-47-card__media be-el-47-card__media--icon" style={iconColour ? { color: iconColour } : undefined}>
        <Icon name={iconName(p.icon) || 'star'} size={num(p.iconSize, 40, 16, 120)} />
      </div>
    )
  } else if (image?.url) {
    mediaNode = (
      <figure className="be-el-47-card__media be-el-47-card__media--image" style={ratio === 'auto' ? undefined : { aspectRatio: RATIO_CSS[ratio] }}>
        <img className={`be-el-47-card__img be-el-47-card__img--${fit}`} src={image.url} alt={str(image.alt)} loading="lazy" />
      </figure>
    )
  }

  const front = (
    <div className={`be-el-47-card__face be-el-47-card__face--front be-el-47-card__front--${layout}`} style={faceStyle(colorOf(p.bgColour))}>
      {mediaNode}
      <div className="be-el-47-card__body">
        {title && <Title tag={titleTag}>{title}</Title>}
        {text && <p className="be-el-47-card__text">{text}</p>}
        {href && linkLabel && <span className="be-el-47-card__more">{linkLabel}</span>}
      </div>
    </div>
  )

  const back = flip ? (
    <div className="be-el-47-card__face be-el-47-card__face--back" style={faceStyle(colorOf(p.backColour) || '#2e3192')}>
      <div className="be-el-47-card__body">
        {backTitle && <p className="be-el-47-card__back-title">{backTitle}</p>}
        {backText && <p className="be-el-47-card__text">{backText}</p>}
      </div>
    </div>
  ) : null

  const faces = flip ? (
    <div className="be-el-47-card__faces">
      {front}
      {back}
    </div>
  ) : (
    front
  )

  // One link around the whole card. Its name is the title, so screen readers do not read the full card text as a label.
  const content = href ? (
    <a className="be-el-47-card__link" href={href} {...linkAttrs(p.link)} aria-label={title || undefined}>
      {faces}
    </a>
  ) : (
    faces
  )

  const classes = [
    'be-el-47-card',
    `be-el-47-card--${align === 'centre' ? 'centre' : 'left'}`,
    shadow !== 'none' ? `be-el-47-card--shadow-${shadow}` : '',
    effect !== 'none' ? `be-el-47-card--${effect === 'zoom-image' ? 'zoom' : effect}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const vars = { '--be-el-47-r': `${radius}px` } as Style

  // A flip with no link needs a stop in the tab order so keyboard users can reach it and turn it over.
  return (
    <article className={classes} style={vars} tabIndex={flip && !href ? 0 : undefined}>
      {content}
    </article>
  )
}

/** Components for the wave-47 elements, keyed by elementType. Spread into ELEMENT_COMPONENTS. */
export const WAVE47_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  card: CardElement,
}
