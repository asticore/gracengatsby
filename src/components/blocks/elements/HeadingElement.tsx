import React from 'react'

export type HeadingElementProps = {
  text?: string
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  align?: 'left' | 'center' | 'right'
  link?: string
}

/**
 * The `heading` element (src/lib/elements/registry.ts). Shared by the live
 * site (BlockRenderer.tsx) and the editor canvas (CanvasBlockPreview.tsx) -
 * same component, so what you see on the canvas is what ships.
 */
export const HeadingElement: React.FC<HeadingElementProps> = ({ text, tag = 'h2', align = 'left', link }) => {
  const Tag = tag
  const body = <Tag style={{ textAlign: align, margin: 0 }}>{text || 'New heading'}</Tag>
  if (!link) return body
  return (
    <a href={link} style={{ textAlign: align, display: 'block', textDecoration: 'none', color: 'inherit' }}>
      {body}
    </a>
  )
}
