'use client'

import React, { useEffect, useRef } from 'react'

type P = { x: number; y: number; vx: number; vy: number; r: number }

/** Dependency-free canvas particles. Fills its parent; pauses off-screen / hidden; static under reduced motion. */
const ParticlesBackground: React.FC<{
  count?: number
  interact?: 'none' | 'repel' | 'attract' | 'connect'
  color?: string
  sizeMin?: number
  sizeMax?: number
  /** Percent of normal speed. */
  speed?: number
  /** 0-1. */
  opacity?: number
  links?: boolean
  linkDistance?: number
  interactRadius?: number
  shape?: 'circle' | 'square'
}> = ({
  count = 50,
  interact = 'repel',
  color = '#6366f1',
  sizeMin = 1,
  sizeMax = 2.8,
  speed = 100,
  opacity = 1,
  links = false,
  linkDistance = 110,
  interactRadius = 120,
  shape = 'circle',
}) => {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !parent || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fine = window.matchMedia('(pointer: fine)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0
    let h = 0
    let parts: P[] = []
    let raf = 0
    let visible = true
    const mouse = { x: -9999, y: -9999 }
    const LINK = linkDistance
    const RAD = interactRadius
    const spd = speed / 100
    const lo = Math.min(sizeMin, sizeMax)
    const hi = Math.max(sizeMin, sizeMax)
    const connect = links || interact === 'connect'

    const seed = () => {
      const n = Math.max(1, Math.min(count, Math.round((w * h) / 14000)))
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4 * spd,
        vy: (Math.random() - 0.5) * 0.4 * spd,
        r: lo + Math.random() * (hi - lo),
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      ctx.strokeStyle = color
      ctx.globalAlpha = opacity
      for (const p of parts) {
        if (shape === 'square') ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
        else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, 6.2832)
          ctx.fill()
        }
      }
      if (connect) {
        for (let i = 0; i < parts.length; i++) {
          const a = parts[i]
          // The pointer acts as one extra node so lines follow it.
          const near = [...parts.slice(i + 1), { x: mouse.x, y: mouse.y } as P]
          for (const b of near) {
            const d = Math.hypot(a.x - b.x, a.y - b.y)
            if (d < LINK) {
              ctx.globalAlpha = (1 - d / LINK) * 0.6 * opacity
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
          }
        }
        ctx.globalAlpha = 1
      }
    }

    const step = () => {
      for (const p of parts) {
        if (interact === 'repel' || interact === 'attract') {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const d = Math.hypot(dx, dy)
          if (d < RAD && d > 0.1) {
            const f = ((RAD - d) / RAD) * 0.08 * (interact === 'repel' ? 1 : -1)
            p.vx += (dx / d) * f
            p.vy += (dy / d) * f
          }
        }
        p.vx *= 0.99
        p.vy *= 0.99
        if (Math.abs(p.vx) < 0.05 * spd) p.vx += (Math.random() - 0.5) * 0.02 * spd
        if (Math.abs(p.vy) < 0.05 * spd) p.vy += (Math.random() - 0.5) * 0.02 * spd
        p.x = (p.x + p.vx + w) % w
        p.y = (p.y + p.vy + h) % h
      }
      draw()
      raf = requestAnimationFrame(step)
    }

    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const sync = () => {
      if (reduced) return
      if (visible && !document.hidden) {
        if (!raf) raf = requestAnimationFrame(step)
      } else stop()
    }

    const resize = () => {
      w = parent.clientWidth
      h = parent.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      draw()
    }
    // The effect layer ignores pointer events, so listen on the block that owns it.
    const host = parent.parentElement
    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect()
      mouse.x = e.clientX - r.left
      mouse.y = e.clientY - r.top
    }
    const onLeave = () => {
      mouse.x = mouse.y = -9999
    }

    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    io.observe(parent)
    document.addEventListener('visibilitychange', sync)
    if (fine && !reduced && interact !== 'none' && host) {
      host.addEventListener('pointermove', onMove, { passive: true })
      host.addEventListener('pointerleave', onLeave)
    }
    resize()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
      host?.removeEventListener('pointermove', onMove)
      host?.removeEventListener('pointerleave', onLeave)
    }
  }, [count, interact, color, sizeMin, sizeMax, speed, opacity, links, linkDistance, interactRadius, shape])

  return <canvas ref={ref} aria-hidden="true" />
}

export default ParticlesBackground
