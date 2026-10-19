import React from 'react'

import './effects.css'
import './effects53.css'

import {
  asBlockStyle,
  blockScopeId,
  blockFxClasses,
  blockFxVars,
  blockStyleClasses,
  blockStyleCss,
  blockStyleToCss,
  dividerBackPath,
  dividerPath,
  hasFxLayer,
  isPeriodicDivider,
  kenBurnsLayer,
  overlayStyle,
  type BlockStyle,
  type DividerAnim,
  type DividerShape,
} from '@/lib/blockStyle'

import { BgNoise, BgSlideshow } from './BgSlideshow'
import { BgVideo } from './BgVideo'
import ParticlesBackground from './ParticlesLazy'
import PointerFxLazy from './PointerFxLazy'

/**
 * Wraps every page-builder block so the per-block "Design" settings (background,
 * spacing, alignment, shape dividers, responsive visibility) apply uniformly.
 *
 * Deliberately renders nothing extra when a block has no style set, so blocks
 * that predate the Design tab keep their original markup and spacing.
 */
/** A DOM-id-safe form of a caller supplied scope string. */
export const safeScope = (scope: string): string => scope.replace(/[^a-zA-Z0-9_-]/g, '_')

export const StyledBlock: React.FC<{
  style?: unknown
  index: number
  /**
   * Makes the responsive-CSS id unique when `index` alone is not (blocks inside columns all
   * start counting at 0, so two columns would otherwise share #be-block-0 and each other's
   * tablet / mobile overrides).
   */
  scope?: string
  children: React.ReactNode
}> = ({ style, index, scope, children }) => {
  const parsed = asBlockStyle(style)
  // `layout` only drives the section's own flex container (SectionBlock), so on its own it
  // must not add a Design wrapper - that would change the section's width and padding.
  const hasStyle = Object.keys(parsed).some((key) => key !== 'layout')

  if (!hasStyle) return <>{children}</>

  const scopeId = parsed.anchorId || (scope ? `be-s-${safeScope(scope)}` : blockScopeId(index))
  const mediaCss = blockStyleCss(parsed, scopeId)
  const kb = kenBurnsLayer(parsed)

  return (
    <div
      id={scopeId}
      className={[blockStyleClasses(parsed), blockFxClasses(parsed)].filter(Boolean).join(' ')}
      style={{ ...blockStyleToCss(parsed), ...blockFxVars(parsed) }}
    >
      {mediaCss && <style dangerouslySetInnerHTML={{ __html: mediaCss }} />}
      {parsed.parallax === 'background' && parsed.bgType === 'image' && parsed.bgImageUrl && (
        <div className="be-fx be-fx--parbg" aria-hidden="true" style={{ backgroundImage: `url(${parsed.bgImageUrl})` }} />
      )}
      {kb && <div className={kb.className} aria-hidden="true" style={kb.style} />}
      {parsed.pointerFx && parsed.pointerFx !== 'none' && (
        <PointerFxLazy mode={parsed.pointerFx} strength={parsed.pointerFxStrength ?? 50} />
      )}
      <BgSlideshow design={parsed} />
      {parsed.bgType === 'video' &&<BgVideo src={parsed.bgVideoUrl} poster={parsed.bgVideoPoster} loop={parsed.bgVideoLoop} />}
      {hasFxLayer(parsed) && (
        <div className={`be-fx be-fx--${parsed.bgEffect}`} aria-hidden="true">
          {parsed.bgEffect === 'particles' && (
            <ParticlesBackground
              count={parsed.particlesCount ?? 50}
              interact={parsed.particlesInteract ?? 'repel'}
              color={parsed.bgEffectColor || '#6366f1'}
              sizeMin={parsed.particlesSizeMin}
              sizeMax={parsed.particlesSizeMax}
              speed={parsed.particlesSpeed}
              opacity={parsed.particlesOpacity === undefined ? undefined : parsed.particlesOpacity / 100}
              links={parsed.particlesLinks}
              linkDistance={parsed.particlesLinkDistance}
              interactRadius={parsed.particlesInteractRadius}
              shape={parsed.particlesShape}
            />
          )}
        </div>
      )}
      <BgNoise design={parsed} />
      {parsed.bgType === 'image' && typeof parsed.bgOverlay === 'number' && parsed.bgOverlay > 0 && (
        <div className="be-block__overlay" style={{ background: `rgba(0,0,0,${parsed.bgOverlay / 100})` }} />
      )}
      {(() => { const o = overlayStyle(parsed); return o ? <div className="be-fx be-fx--overlay" aria-hidden="true" style={o} /> : null })()}
      <ShapeDivider
        shape={parsed.dividerTop}
        color={parsed.dividerTopColor}
        height={parsed.dividerTopHeight}
        flip={parsed.dividerTopFlip}
        anim={parsed.dividerTopAnim}
        speed={parsed.dividerTopSpeed}
        position="top"
      />
      <div className="be-block__content">{children}</div>
      <ShapeDivider
        shape={parsed.dividerBottom}
        color={parsed.dividerBottomColor}
        height={parsed.dividerBottomHeight}
        flip={parsed.dividerBottomFlip}
        anim={parsed.dividerBottomAnim}
        speed={parsed.dividerBottomSpeed}
        position="bottom"
      />
    </div>
  )
}

export const ShapeDivider: React.FC<{
  shape?: DividerShape
  color?: string
  height?: number
  flip?: boolean
  position: 'top' | 'bottom'
  anim?: DividerAnim
  /** Seconds per loop, 4-60. */
  speed?: number
}> = ({ shape, color, height, flip, position, anim, speed }) => {
  const path = dividerPath(shape || 'none')
  if (!path) return null

  const fill = color || '#ffffff'
  const back = dividerBackPath(shape)
  const periodic = isPeriodicDivider(shape)
  const secs = Math.min(60, Math.max(4, typeof speed === 'number' && Number.isFinite(speed) ? speed : 14))
  // Non-periodic shapes can't slide seamlessly, so they bob instead.
  const mode: DividerAnim = !anim || anim === 'none' ? 'none' : anim === 'float' || !periodic ? 'float' : anim

  // The base paths are drawn to sit against the bottom edge, so a top divider
  // is the same shape rotated 180deg. `flip` mirrors horizontally on top of that.
  const transforms = [position === 'top' ? 'rotate(180deg)' : null, flip ? 'scaleX(-1)' : null].filter(Boolean)

  const paths = (offset: number) => (
    <>
      {back && <path d={back} fill={fill} opacity={0.5} transform={offset ? `translate(${offset})` : undefined} />}
      <path d={path} fill={fill} transform={offset ? `translate(${offset})` : undefined} />
    </>
  )
  const plain = (key: string, svgStyle?: React.CSSProperties, cls?: string) => (
    <svg key={key} viewBox="0 0 1200 120" preserveAspectRatio="none" focusable="false" className={cls} style={svgStyle}>
      {paths(0)}
    </svg>
  )
  const wide = (key: string, svgStyle: React.CSSProperties) => (
    <svg key={key} viewBox="0 0 2400 120" preserveAspectRatio="none" focusable="false" className="be-divider__drift" style={svgStyle}>
      {paths(0)}
      {paths(1200)}
    </svg>
  )

  let svgs: React.ReactNode
  if (mode === 'drift') svgs = wide('d', { animationDuration: `${secs}s` })
  else if (mode === 'layers' && periodic) {
    // Three stacked copies, back to front, each sliding at its own speed and direction.
    svgs = [
      wide('l3', { opacity: 0.3, top: '-16%', animationDuration: `${secs * 1.7}s`, animationDirection: 'reverse' }),
      wide('l2', { opacity: 0.5, top: '-8%', animationDuration: `${secs * 1.3}s` }),
      wide('l1', { animationDuration: `${secs}s`, animationDirection: 'reverse' }),
    ]
  } else if (mode === 'float') {
    svgs = plain('f', { animationDuration: `${Math.max(2, secs / 3)}s` }, 'be-divider__float')
  } else svgs = plain('s')

  return (
    <div
      className={`be-divider be-divider--${position}${mode !== 'none' ? ' be-divider--anim' : ''}`}
      style={{
        height: `${typeof height === 'number' && height > 0 ? height : 60}px`,
        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
      }}
      aria-hidden="true"
    >
      {svgs}
    </div>
  )
}

export type { BlockStyle }
