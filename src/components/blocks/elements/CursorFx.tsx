'use client'

import React, { useEffect, useRef } from 'react'

export type CursorMode = 'ring' | 'dot-ring'

/** Elements the ring grows over. */
const INTERACTIVE = 'a[href],button,[role="button"],input,select,textarea,label,summary'

/**
 * Custom cursor for the `page-effects` element. Draws a ring (and optionally a centre dot) that follows the pointer;
 * the ring eases behind it and grows over links and buttons. Sizes and colour come from CSS variables written by
 * Wave44Elements (clamped and checked), styles live in wave44.css.
 *
 * Does nothing (renders nothing, attaches nothing) on touch / coarse pointers and under reduced motion. The native
 * cursor stays visible unless `hideNative` is on; that adds one class to <html> only while this is mounted and active.
 */
const CursorFx: React.FC<{ mode: CursorMode; hideNative: boolean }> = ({ mode, hideNative }) => {
  const ring = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Touch / coarse pointers and reduced motion: attach nothing (wave44.css also hides the elements).
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ringEl = ring.current
    const dotEl = dot.current
    if (!ringEl) return
    let tx = 0
    let ty = 0
    let rx = 0
    let ry = 0
    let raf = 0
    let seen = false

    const tick = () => {
      raf = 0
      rx += (tx - rx) * 0.2
      ry += (ty - ry) * 0.2
      ringEl.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0) translate(-50%,-50%)`
      if (Math.abs(tx - rx) > 0.3 || Math.abs(ty - ry) > 0.3) raf = requestAnimationFrame(tick)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      tx = e.clientX
      ty = e.clientY
      if (!seen) {
        seen = true
        rx = tx
        ry = ty
        ringEl.dataset.on = '1'
        if (dotEl) dotEl.dataset.on = '1'
      }
      if (dotEl) dotEl.style.transform = `translate3d(${tx}px,${ty}px,0) translate(-50%,-50%)`
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onOver = (e: PointerEvent) => {
      const t = e.target
      ringEl.dataset.hover = t instanceof Element && t.closest(INTERACTIVE) ? '1' : '0'
    }
    const onLeave = () => {
      seen = false
      delete ringEl.dataset.on
      if (dotEl) delete dotEl.dataset.on
    }
    const onDown = () => { ringEl.dataset.down = '1' }
    const onUp = () => { delete ringEl.dataset.down }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    if (hideNative) document.documentElement.classList.add('be-cursor-hide')
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.documentElement.classList.remove('be-cursor-hide')
    }
  }, [hideNative])

  return (
    <>
      <div ref={ring} className="be-el-44-cursor-ring" />
      {mode === 'dot-ring' && <div ref={dot} className="be-el-44-cursor-dot" />}
    </>
  )
}

export default CursorFx
