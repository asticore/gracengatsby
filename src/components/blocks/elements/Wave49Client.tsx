'use client'

import React, { useEffect, useId, useRef, useState } from 'react'

/*
 * Interactive parts of the wave-49 gallery. The markup is rendered on the server by Wave49Elements.tsx and passed in
 * as children, so nothing here is needed to see the pictures:
 *  - GalleryCarousel: the track scrolls by touch, wheel or keyboard with no script. Buttons and autoplay need script.
 *  - GalleryLightbox: each picture is a real link to the full image, so without script it just opens that image.
 *    With script the link opens a dialog instead (focus trapped, Escape closes, focus goes back to the link).
 * Only components are exported from this module, so the server can import the element module safely.
 */

/** A picture the lightbox can show. Plain data, so it crosses from the server render. */
export type GalleryItem = { url: string; alt: string }

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
const AUTOPLAY_MS = 6000
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** True while the visitor has asked for reduced motion. Starts false so the first render matches the server markup. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(REDUCED_QUERY)
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** Scrolls the track one viewful forward or back, wrapping at either end. */
function pageBy(el: HTMLElement | null, dir: 1 | -1, smooth: boolean) {
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  let left = el.scrollLeft + dir * el.clientWidth
  if (dir > 0 && el.scrollLeft >= max - 2) left = 0
  if (dir < 0 && el.scrollLeft <= 2) left = max
  el.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior: smooth ? 'smooth' : 'auto' })
}

/** Carousel: a scroll-snapped track (children are the slides), prev and next buttons, and autoplay with a pause button. */
export const GalleryCarousel: React.FC<{ autoplay: boolean; label: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ autoplay, label, style, children }) => {
  const reduced = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const canAutoplay = autoplay && !reduced
  const running = canAutoplay && !paused

  useEffect(() => {
    if (!running) return undefined
    const id = window.setInterval(() => pageBy(track.current, 1, true), AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [running])

  return (
    <div className="be-el-49-car" style={style}>
      <div className="be-el-49-car__track" ref={track} role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <div className="be-el-49-car__controls">
        {canAutoplay && (
          <button type="button" className="be-el-49-car__btn" aria-label={running ? 'Pause slideshow' : 'Play slideshow'} onClick={() => setPaused((p) => !p)}>
            {running ? 'Pause' : 'Play'}
          </button>
        )}
        <button type="button" className="be-el-49-car__btn" aria-label="Previous pictures" onClick={() => pageBy(track.current, -1, !reduced)}>
          &larr;
        </button>
        <button type="button" className="be-el-49-car__btn" aria-label="Next pictures" onClick={() => pageBy(track.current, 1, !reduced)}>
          &rarr;
        </button>
      </div>
    </div>
  )
}

/** Lightbox: clicks on links marked data-be-gallery-index open a dialog showing that picture. Children are the server markup. */
export const GalleryLightbox: React.FC<{ items: GalleryItem[]; children: React.ReactNode }> = ({ items, children }) => {
  const [index, setIndex] = useState<number | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const titleId = useId()
  const count = items.length
  const open = index !== null
  const item = index !== null ? items[index] : undefined

  // Focus moves to Close when the dialog opens, locks page scroll, and goes back to the picture's link on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      closeBtn.current?.focus()
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previous
      }
    }
    if (wasOpen.current) {
      wasOpen.current = false
      opener.current?.focus()
    }
    return undefined
  }, [open])

  const move = (d: 1 | -1) => setIndex((i) => (i === null || count === 0 ? i : (i + d + count) % count))
  const close = () => setIndex(null)

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!(e.target instanceof Element)) return
    const link = e.target.closest<HTMLAnchorElement>('a[data-be-gallery-index]')
    const i = Number(link?.dataset.beGalleryIndex)
    if (!link || !Number.isInteger(i) || !items[i]) return
    e.preventDefault()
    opener.current = link
    setIndex(i)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowRight') {
      move(1)
    } else if (e.key === 'ArrowLeft') {
      move(-1)
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog: wrap from the last control to the first and back.
      const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !e.currentTarget.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      <div onClick={onClick}>{children}</div>
      {open && item && (
        <div className="be-el-49-lb" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
          <div className="be-el-49-lb__panel">
            <p id={titleId} className="be-el-49-sr">
              Picture {(index ?? 0) + 1} of {count}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="be-el-49-lb__img" src={item.url} alt={item.alt} />
            {item.alt && <p className="be-el-49-lb__caption" aria-hidden="true">{item.alt}</p>}
            <div className="be-el-49-lb__bar">
              {count > 1 && (
                <button type="button" className="be-el-49-lb__btn" aria-label="Previous picture" onClick={() => move(-1)}>
                  &larr;
                </button>
              )}
              {count > 1 && (
                <button type="button" className="be-el-49-lb__btn" aria-label="Next picture" onClick={() => move(1)}>
                  &rarr;
                </button>
              )}
              <button type="button" className="be-el-49-lb__btn" ref={closeBtn} onClick={close}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
