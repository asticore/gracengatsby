'use client'

import React, { useEffect } from 'react'

import CursorFxLazy from '@/components/blocks/elements/CursorFxLazy'
import '@/components/blocks/elements/wave44.css'

import type { SiteEffectsConfig } from './siteEffectsConfig'

const REVEAL_CSS =
  '@media (prefers-reduced-motion: no-preference){.eg-reveal{opacity:0;transform:translateY(12px);transition:opacity .6s ease,transform .6s ease}.eg-reveal.eg-in{opacity:1;transform:none}}'

function useReveal(on: boolean) {
  useEffect(() => {
    if (!on) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const targets = Array.from(document.querySelectorAll<HTMLElement>('main > *'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('eg-in')
            io.unobserve(en.target)
          }
        }
      },
      { threshold: 0.08 },
    )
    for (const el of targets) {
      el.classList.add('eg-reveal')
      io.observe(el)
    }
    return () => {
      io.disconnect()
      for (const el of targets) el.classList.remove('eg-reveal', 'eg-in')
    }
  }, [on])
}

/** Site-wide effects, reusing the page-effects element's cursor and progress bar. Reduced motion is always respected. */
export const SiteEffects: React.FC<{ config: SiteEffectsConfig }> = ({ config }) => {
  useReveal(config.revealOnScroll)
  return (
    <div className="be-el-44" aria-hidden="true">
      {config.revealOnScroll && <style>{REVEAL_CSS}</style>}
      {config.scrollProgress && <div className="be-el-44-progress" />}
      {config.cursor !== 'none' && <CursorFxLazy mode={config.cursor} hideNative={false} />}
    </div>
  )
}

export default SiteEffects
