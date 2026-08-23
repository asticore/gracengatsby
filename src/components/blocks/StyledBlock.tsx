import React from 'react'

import {
  asBlockStyle,
  blockScopeId,
  blockStyleClasses,
  blockStyleCss,
  blockStyleToCss,
  dividerPath,
  type BlockStyle,
  type DividerShape,
} from '@/lib/blockStyle'

/**
 * Wraps every page-builder block so the per-block "Design" settings (background,
 * spacing, alignment, shape dividers, responsive visibility) apply uniformly.
 *
 * Deliberately renders nothing extra when a block has no style set, so blocks
 * that predate the Design tab keep their original markup and spacing.
 */
export const StyledBlock: React.FC<{
  style?: unknown
  index: number
  children: React.ReactNode
}> = ({ style, index, children }) => {
  const parsed = asBlockStyle(style)
  const hasStyle = Object.keys(parsed).length > 0

  if (!hasStyle) return <>{children}</>

  const scopeId = parsed.anchorId || blockScopeId(index)
  const mediaCss = blockStyleCss(parsed, scopeId)

  return (
    <div id={scopeId} className={blockStyleClasses(parsed)} style={blockStyleToCss(parsed)}>
      {mediaCss && <style dangerouslySetInnerHTML={{ __html: mediaCss }} />}
      {parsed.bgType === 'image' && typeof parsed.bgOverlay === 'number' && parsed.bgOverlay > 0 && (
        <div className="be-block__overlay" style={{ background: `rgba(0,0,0,${parsed.bgOverlay / 100})` }} />
      )}
      <ShapeDivider
        shape={parsed.dividerTop}
        color={parsed.dividerTopColor}
        height={parsed.dividerTopHeight}
        flip={parsed.dividerTopFlip}
        position="top"
      />
      <div className="be-block__content">{children}</div>
      <ShapeDivider
        shape={parsed.dividerBottom}
        color={parsed.dividerBottomColor}
        height={parsed.dividerBottomHeight}
        flip={parsed.dividerBottomFlip}
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
}> = ({ shape, color, height, flip, position }) => {
  const path = dividerPath(shape || 'none')
  if (!path) return null

  // The base paths are drawn to sit against the bottom edge, so a top divider
  // is the same shape rotated 180deg. `flip` mirrors horizontally on top of that.
  const transforms = [position === 'top' ? 'rotate(180deg)' : null, flip ? 'scaleX(-1)' : null].filter(Boolean)

  return (
    <div
      className={`be-divider be-divider--${position}`}
      style={{
        height: `${typeof height === 'number' && height > 0 ? height : 60}px`,
        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none" focusable="false">
        <path d={path} fill={color || '#ffffff'} />
      </svg>
    </div>
  )
}

export type { BlockStyle }
