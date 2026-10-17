'use client'

import React, { useEffect, useRef } from 'react'

export type PointerFxMode = 'spotlight' | 'tilt' | 'magnetic'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Pointer-following effect for one block. Draws nothing itself: it writes CSS custom properties on
 * the block that holds it (--mx/--my for spotlight, --rx/--ry for tilt, --mgx/--mgy for magnetic) and
 * effects.css does the rest. Listeners attach only while the block is on screen, and nothing is
 * attached on touch or reduced-motion devices. Pointer moves are coalesced into one animation frame.
 */
const PointerFx: React.FC<{ mode: PointerFxMode; strength: number }> = ({ mode, strength }) => {
  const marker = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = marker.current?.parentElement
    if (!host) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const s = clamp(strength, 0, 100) / 100
    const maxDeg = clamp(strength, 0, 100) / 5
    let raf = 0
    let x = 0
    let y = 0
    let attached = false

    const apply = () => {
      raf = 0
      const r = host.getBoundingClientRect()
      if (mode === 'spotlight') {
        host.style.setProperty('--mx', `${x - r.left}px`)
        host.style.setProperty('--my', `${y - r.top}px`)
        return
      }
      // Pointer position across the block, from -1 (left/top edge) to 1 (right/bottom edge).
      const nx = r.width ? ((x - r.left) / r.width) * 2 - 1 : 0
      const ny = r.height ? ((y - r.top) / r.height) * 2 - 1 : 0
      if (mode === 'tilt') {
        host.style.setProperty('--rx', `${(-ny * maxDeg).toFixed(2)}deg`)
        host.style.setProperty('--ry', `${(nx * maxDeg).toFixed(2)}deg`)
      } else {
        // Pull toward the pointer, capped at 24px for full strength.
        const dx = x - (r.left + r.width / 2)
        const dy = y - (r.top + r.height / 2)
        const cap = 24 * s
        host.style.setProperty('--mgx', `${clamp(dx * 0.1 * s, -cap, cap).toFixed(2)}px`)
        host.style.setProperty('--mgy', `${clamp(dy * 0.1 * s, -cap, cap).toFixed(2)}px`)
      }
    }

    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (!raf) raf = requestAnimationFrame(apply)
    }

    // Tilt and magnetic return to rest on leave (the CSS transition makes that a smooth spring-back).
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      if (mode === 'tilt') {
        host.style.setProperty('--rx', '0deg')
        host.style.setProperty('--ry', '0deg')
      } else if (mode === 'magnetic') {
        host.style.setProperty('--mgx', '0px')
        host.style.setProperty('--mgy', '0px')
      }
    }

    const attach = () => {
      if (attached) return
      attached = true
      host.addEventListener('pointermove', onMove, { passive: true })
      host.addEventListener('pointerleave', onLeave)
    }
    const detach = () => {
      if (!attached) return
      attached = false
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      onLeave()
    }

    if (typeof IntersectionObserver === 'undefined') {
      attach()
      return detach
    }
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? attach() : detach()))
    io.observe(host)
    return () => {
      io.disconnect()
      detach()
    }
  }, [mode, strength])

  return <span ref={marker} hidden aria-hidden="true" />
}

export default PointerFx
