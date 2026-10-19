/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { flag, mediaListOf, num, pick, ratioCss, str } from './elementUtil'
import type { MediaRef } from './elementUtil'
import { GalleryCarousel, GalleryLightbox } from './Wave49Client'
import type { GalleryItem } from './Wave49Client'
import './wave49.css'

/**
 * Wave 49 renderer: the Gallery element (src/lib/elements/wave49Defs.ts). Most of it is server markup: grid, masonry and logo strip need no script at all. Carousel and lightbox wrap that markup in a small client component (Wave49Client.tsx), which only adds behaviour. Motion is CSS only (wave49.css) inside a prefers-reduced-motion guard.
 *
 * Every picture is a link to its full image when the lightbox is on, so the gallery works without script. Pictures come from media ids or from pasted addresses (mediaListOf drops unsafe schemes). Alt text is React text, so it is escaped.
 */

type P = Record<string, unknown>

const LAYOUTS = ['grid', 'masonry', 'carousel', 'logos'] as const
const FITS = ['cover', 'contain'] as const
const GREYS = ['auto', 'on', 'off'] as const

/** `gallery`: pictures as a grid, masonry wall, carousel or logo strip. Renders a hint when there are no pictures. */
export const GalleryElement: React.FC<P> = (p) => {
  const items: GalleryItem[] = mediaListOf(p.images, p.urls)
    .filter((m): m is MediaRef & { url: string } => Boolean(m.url))
    .map((m) => ({ url: m.url, alt: str(m.alt) }))
  if (items.length === 0) return <div className="el-placeholder">Add pictures to the gallery</div>

  const layout = pick(p.layout, LAYOUTS, 'grid')
  const cols = Math.round(num(p.columns, 3, 1, 6))
  const gap = num(p.gap, 12, 0, 48)
  const ratio = ratioCss(p.ratio)
  const fit = pick(p.fit, FITS, 'cover')
  const grey = pick(p.grayscale, GREYS, 'auto')
  const greyed = grey === 'on' || (grey === 'auto' && layout === 'logos')
  const lightbox = flag(p.lightbox, true) && layout !== 'logos'
  const captions = flag(p.captions, false)
  const autoplay = flag(p.autoplay, false)
  const label = str(p.label).trim() || 'Image gallery'

  // Masonry keeps each picture's own shape; the logo strip sets its own height in CSS.
  const shape = layout === 'masonry' || layout === 'logos' ? undefined : ratio === 'auto' ? (layout === 'carousel' ? '4 / 3' : undefined) : ratio
  const imgFit = layout === 'logos' ? 'contain' : fit
  const vars = { '--be-el-49-cols': String(cols), '--be-el-49-gap': `${gap}px` } as React.CSSProperties

  const figure = (m: GalleryItem, i: number) => {
    const img = <img className="be-el-49-gallery__img" src={m.url} alt={m.alt} loading="lazy" style={{ aspectRatio: shape, objectFit: imgFit }} />
    return (
      <figure className="be-el-49-gallery__item">
        {lightbox ? (
          <a className="be-el-49-gallery__link" href={m.url} data-be-gallery-index={i} aria-label={m.alt || `Picture ${i + 1}`}>
            {img}
          </a>
        ) : (
          img
        )}
        {captions && m.alt && <figcaption>{m.alt}</figcaption>}
      </figure>
    )
  }

  if (layout === 'carousel') {
    const track = (
      <GalleryCarousel autoplay={autoplay} label={label} style={vars}>
        {items.map((m, i) => (
          <div className="be-el-49-car__slide" key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            {figure(m, i)}
          </div>
        ))}
      </GalleryCarousel>
    )
    return lightbox ? <GalleryLightbox items={items}>{track}</GalleryLightbox> : track
  }

  const list = (
    <ul className={`be-el-49-gallery be-el-49-gallery--${layout}${greyed ? ' be-el-49-gallery--grey' : ''}`} style={vars}>
      {items.map((m, i) => (
        <li key={i}>{figure(m, i)}</li>
      ))}
    </ul>
  )
  return lightbox ? <GalleryLightbox items={items}>{list}</GalleryLightbox> : list
}

/** Components for the wave-49 elements, keyed by elementType. Spread into ELEMENT_COMPONENTS. */
export const WAVE49_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  gallery: GalleryElement,
}
