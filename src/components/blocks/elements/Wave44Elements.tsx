import React from 'react'

import { isSafeColor } from '@/lib/blockStyle'

import { flag, num, str } from './elementUtil'
import './wave44.css'

/**
 * Wave 44 renderer: `page-effects`, one site-wide element. It draws nothing in the flow. It writes a <style> tag with
 * static rules whose only variables are clamped numbers and checked colours, and it adds a grain overlay and a
 * progress bar when those are on. No client JS. Defs live in src/lib/elements/wave44Defs.ts.
 *
 * Every effect is off by default. Motion sits inside a prefers-reduced-motion: no-preference guard, so visitors who
 * ask for reduced motion get the static page.
 */

type P = Record<string, unknown>

/** A colour the CSS can take as-is: hex, rgb(...) or hsl(...). Also must pass the shared safe-colour check. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
const DEFAULT_COLOR = '#2e3192'

export type PageEffects = {
  smoothScroll: boolean
  pageTransition: boolean
  transitionMs: number
  grain: boolean
  grainOpacity: number
  scrollProgress: boolean
  progressColor: string
  progressHeight: number
}

/** The stored props, read and clamped. Numbers are whole numbers inside their slider range. */
export function pageEffectsOf(p: P): PageEffects {
  const raw = str(p.progressColor).trim()
  return {
    smoothScroll: flag(p.smoothScroll, false),
    pageTransition: flag(p.pageTransition, false),
    transitionMs: Math.round(num(p.transitionMs, 250, 100, 600)),
    grain: flag(p.grain, false),
    grainOpacity: Math.round(num(p.grainOpacity, 8, 1, 30)),
    scrollProgress: flag(p.scrollProgress, false),
    progressColor: isSafeColor(raw) && COLOR_RE.test(raw) ? raw : DEFAULT_COLOR,
    progressHeight: Math.round(num(p.progressHeight, 4, 1, 8)),
  }
}

/** Labels of the effects that are switched on. Used by the editor canvas placeholder. */
export function enabledPageEffects(p: P): string[] {
  const e = pageEffectsOf(p)
  const out: string[] = []
  if (e.smoothScroll) out.push('Smooth scrolling')
  if (e.pageTransition) out.push(`Fade between pages (${e.transitionMs} ms)`)
  if (e.grain) out.push(`Grain overlay (${e.grainOpacity}%)`)
  if (e.scrollProgress) out.push(`Scroll progress bar (${e.progressHeight} px)`)
  return out
}

/**
 * The static rules for the enabled effects. Only clamped numbers and the checked colour are interpolated. Returns ''
 * when nothing is on.
 */
export function pageEffectsCss(p: P): string {
  const e = pageEffectsOf(p)
  const rules: string[] = []
  if (e.smoothScroll) rules.push('@media (prefers-reduced-motion: no-preference){html{scroll-behavior:smooth}}')
  if (e.pageTransition) {
    rules.push(
      `@view-transition{navigation:auto}::view-transition-old(root),::view-transition-new(root){animation-duration:${e.transitionMs}ms}@media (prefers-reduced-motion: reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}`,
    )
  }
  if (e.grain) rules.push(`.be-el-44 .be-el-44-grain{opacity:${e.grainOpacity / 100}}`)
  if (e.scrollProgress) rules.push(`.be-el-44 .be-el-44-progress{background:${e.progressColor};height:${e.progressHeight}px}`)
  return rules.join('')
}

/**
 * `page-effects`: the wrapper, the <style> with the effect rules, and the overlay and bar elements. The wrapper is
 * hidden from assistive technology (the overlay and bar are decorative). With every effect off it renders nothing.
 */
export const PageEffectsElement: React.FC<P> = (p) => {
  const e = pageEffectsOf(p)
  const css = pageEffectsCss(p)
  if (!css) return null
  return (
    <div className="be-el-44" aria-hidden="true">
      <style>{css}</style>
      {e.grain && <div className="be-el-44-grain" />}
      {e.scrollProgress && <div className="be-el-44-progress" />}
    </div>
  )
}

/** Component table for elementComponents.tsx, keyed by element type. */
export const WAVE44_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'page-effects': PageEffectsElement,
}
