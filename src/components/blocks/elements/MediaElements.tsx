/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { safeUrl } from '@/lib/mergeTags'

import { Icon } from './icons'
import { ALIGNS, alignClass } from './TextElements'
import { flag, mediaListOf, mediaOf, num, parseVideoUrl, pick, ratioCss, str } from './elementUtil'

type P = Record<string, unknown>

const Placeholder: React.FC<{ label: string }> = ({ label }) => <div className="el-placeholder">{label}</div>

/** `image`: one picture with optional link, caption, aspect ratio and width. */
export const ImageElement: React.FC<P> = (p) => {
  const media = mediaOf(p.image) || mediaOf(p.url)
  const ratio = ratioCss(p.ratio)
  const width = num(p.width, 100, 5, 100)
  const href = safeUrl(p.link)
  const caption = str(p.caption)
  const alt = str(p.alt) || str(media?.alt)
  const img = media?.url ? (
    <img
      src={media.url}
      alt={alt}
      loading="lazy"
      className="el-image__img"
      style={{ aspectRatio: ratio === 'auto' ? undefined : ratio, objectFit: pick(p.fit, ['cover', 'contain'] as const, 'cover') }}
    />
  ) : (
    <Placeholder label="Choose an image" />
  )
  return (
    <figure className={`el-image ${alignClass(p.align)}`} style={{ maxWidth: `${width}%` }}>
      {href && media?.url ? <a href={href}>{img}</a> : img}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** `video`: YouTube (no-cookie host), Vimeo (do-not-track) or a direct mp4/webm file, always 16:9. */
export const VideoElement: React.FC<P> = (p) => {
  const source = parseVideoUrl(p.url)
  const title = str(p.title, 'Video')
  const caption = str(p.caption)
  return (
    <figure className="el-video">
      <div className="el-video__frame">
        {!source ? (
          <Placeholder label="Paste a YouTube, Vimeo or .mp4 link" />
        ) : source.kind === 'file' ? (
          <video src={source.src} controls preload="metadata" playsInline aria-label={title} />
        ) : (
          <iframe
            src={source.src}
            title={title}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** `image-gallery`: a responsive grid of pictures. */
export const ImageGalleryElement: React.FC<P> = (p) => {
  const items = mediaListOf(p.images, p.urls)
  const cols = Math.round(num(p.columns, 3, 1, 6))
  const ratio = ratioCss(p.ratio)
  if (items.length === 0) return <Placeholder label="Add images to the gallery" />
  return (
    <ul className="el-gallery" style={{ ['--el-cols' as string]: String(cols) }}>
      {items.map((m, i) => (
        <li key={i}>
          <img src={m.url || ''} alt={str(m.alt)} loading="lazy" style={{ aspectRatio: ratio === 'auto' ? '1 / 1' : ratio }} />
        </li>
      ))}
    </ul>
  )
}

/** `image-carousel`: a horizontally scrolling, scroll-snapped strip. No script; scrolls by touch, wheel or keyboard. */
export const ImageCarouselElement: React.FC<P> = (p) => {
  const items = mediaListOf(p.images, p.urls)
  const visible = Math.round(num(p.visible, 1, 1, 4))
  const ratio = ratioCss(p.ratio)
  if (items.length === 0) return <Placeholder label="Add images to the carousel" />
  return (
    <div className="el-carousel" role="region" aria-label={str(p.label, 'Image carousel')} tabIndex={0} style={{ ['--el-visible' as string]: String(visible) }}>
      {items.map((m, i) => (
        <div className="el-carousel__slide" key={i}>
          <img src={m.url || ''} alt={str(m.alt)} loading="lazy" style={{ aspectRatio: ratio === 'auto' ? '16 / 9' : ratio }} />
        </div>
      ))}
    </div>
  )
}

/** `icon`: one decorative or linked icon from the built-in set. */
export const IconElement: React.FC<P> = (p) => {
  const size = num(p.size, 48, 12, 200)
  const href = safeUrl(p.link)
  const label = str(p.label)
  const icon = <Icon name={str(p.icon, 'star')} size={size} />
  return (
    <div className={`el-icon ${alignClass(p.align)}`}>
      {href ? (
        <a href={href} aria-label={label || undefined}>
          {icon}
        </a>
      ) : (
        icon
      )}
    </div>
  )
}

/** `logo-strip`: a row of brand logos, optionally greyscale until hovered. */
export const LogoStripElement: React.FC<P> = (p) => {
  const items = mediaListOf(p.images, p.urls)
  const height = num(p.height, 40, 16, 160)
  if (items.length === 0) return <Placeholder label="Add logos" />
  return (
    <ul className={`el-logos ${flag(p.grayscale, true) ? 'el-logos--gray' : ''} ${alignClass(pick(p.align, ALIGNS, 'center'))}`}>
      {items.map((m, i) => (
        <li key={i}>
          <img src={m.url || ''} alt={str(m.alt)} loading="lazy" style={{ height }} />
        </li>
      ))}
    </ul>
  )
}
