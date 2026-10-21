import React from 'react'

import { linkAttrs, linkHref, lines, pick } from './elementUtil'
import { SafeInlineHtml } from './SafeInlineHtml'
import { AnimatedHeadlineElement, DualHeadingElement } from './Wave36Elements'
import { HighlightTextElement, SplitTextElement } from './Wave43Elements'

export const HEADING_EFFECTS = ['none', 'two-tone', 'rotate', 'split', 'highlight'] as const
export type HeadingEffect = (typeof HEADING_EFFECTS)[number]

export type HeadingElementProps = {
  text?: string
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  align?: 'left' | 'center' | 'right'
  link?: unknown
  /** Styling variant. Unset or 'none' renders the plain heading. */
  effect?: HeadingEffect
  /** two-tone: the second part, in secondColour. */
  secondText?: string
  secondColour?: string
  /** rotate: one word or phrase per line, shown in turn after `text`. */
  words?: string
  speed?: 'slow' | 'normal' | 'fast'
  /** split: pieces revealed one by one. */
  splitBy?: 'word' | 'letter'
  animation?: 'fade-up' | 'blur' | 'slide'
  /** highlight: the phrase inside `text` that gets the marker. */
  markerPhrase?: string
  markerStyle?: 'underline' | 'underline-wavy' | 'box' | 'circle'
  markerColour?: string
}

/** Rotate speed as a multiplier on the cycle length (see effects.css). */
const SPEED: Record<'slow' | 'normal' | 'fast', number> = { slow: 0.5, normal: 1, fast: 2 }

/**
 * Splits `text` around the first match of `phrase` (case-insensitive when that keeps the lengths aligned).
 * No match means the whole text is `before`, so the heading still shows everything.
 */
function splitAround(text: string, phrase: string): { before: string; phrase: string; after: string } {
  const needle = phrase.trim()
  const none = { before: text, phrase: '', after: '' }
  if (!needle) return none
  let at = text.indexOf(needle)
  if (at < 0) {
    const lower = text.toLowerCase()
    if (lower.length !== text.length) return none
    at = lower.indexOf(needle.toLowerCase())
  }
  if (at < 0) return none
  return { before: text.slice(0, at), phrase: text.slice(at, at + needle.length), after: text.slice(at + needle.length) }
}

/**
 * The effect markup, built from the exported components of the widgets it replaces (Wave36Elements,
 * Wave43Elements), so the classes and motion are the same ones those widgets use. Null when the effect has
 * nothing to show, so the caller falls back to the plain heading.
 */
function effectMarkup(p: HeadingElementProps, effect: HeadingEffect, tag: NonNullable<HeadingElementProps['tag']>, align: string): React.ReactNode {
  const text = (p.text ?? '').trim()
  switch (effect) {
    case 'two-tone': {
      const second = (p.secondText ?? '').trim()
      if (!text && !second) return null
      return <DualHeadingElement first={text} second={second} color={p.secondColour} tag={tag} align={align} />
    }
    case 'rotate': {
      if (lines(p.words).length === 0) return null
      return <AnimatedHeadlineElement before={text} words={p.words} after="" tag={tag} style="fade" />
    }
    case 'split': {
      if (!text) return null
      return <SplitTextElement text={text} by={pick(p.splitBy, ['word', 'letter'] as const, 'word')} effect={pick(p.animation, ['fade-up', 'blur', 'slide'] as const, 'fade-up')} tag={tag} />
    }
    case 'highlight': {
      if (!text) return null
      const parts = splitAround(text, p.markerPhrase ?? '')
      return (
        <HighlightTextElement
          before={parts.before}
          phrase={parts.phrase}
          after={parts.after}
          tag={tag}
          style={pick(p.markerStyle, ['underline', 'underline-wavy', 'box', 'circle'] as const, 'underline')}
          color={p.markerColour}
          trigger="view"
        />
      )
    }
    default:
      return null
  }
}

/**
 * The `heading` element (src/lib/elements/registry.ts). Shared by the live
 * site (BlockRenderer.tsx) and the editor canvas (CanvasBlockPreview.tsx) -
 * same component, so what you see on the canvas is what ships.
 *
 * With no effect (the default) the markup is exactly the plain heading it always was. An effect wraps the
 * matching widget markup in `.be-heading-fx` (styles in src/components/blocks/effects.css).
 */
export const HeadingElement: React.FC<HeadingElementProps> = (props) => {
  const { text, tag = 'h2', align = 'left', link } = props
  const Tag = tag
  const effect = pick(props.effect, HEADING_EFFECTS, 'none')
  const effectNode = effect === 'none' ? null : effectMarkup(props, effect, tag, align)
  const body = effectNode ? (
    <div
      className={`be-heading-fx be-heading-fx--${effect}`}
      style={{ textAlign: align, margin: 0, '--be-heading-speed': SPEED[pick(props.speed, ['slow', 'normal', 'fast'] as const, 'normal')] } as React.CSSProperties}
    >
      {effectNode}
    </div>
  ) : (
    <SafeInlineHtml as={Tag} style={{ textAlign: align, margin: 0 }} text={text || 'New heading'} />
  )
  const href = linkHref(link)
  if (!href) return body
  return (
    <a href={href} {...linkAttrs(link)} style={{ textAlign: align, display: 'block', textDecoration: 'none', color: 'inherit' }}>
      {body}
    </a>
  )
}
