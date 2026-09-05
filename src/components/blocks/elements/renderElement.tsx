import React from 'react'

import { HeadingElement } from './HeadingElement'

/**
 * Sub-dispatch for the `element` block, keyed by `props.elementType` rather
 * than `blockType` - this is the free part of the design described in
 * src/blocks/Element.ts: adding a new element type here costs no schema, only
 * a case. Shared by the live site (BlockRenderer.tsx) and the editor canvas
 * (CanvasBlockPreview.tsx).
 */
export const renderElement = (elementType: string, props: Record<string, unknown>): React.ReactNode => {
  switch (elementType) {
    case 'heading':
      return (
        <HeadingElement
          text={props.text as string}
          tag={props.tag as HeadingElementProps['tag']}
          align={props.align as HeadingElementProps['align']}
          link={props.link as string}
        />
      )
    default:
      return null
  }
}

type HeadingElementProps = React.ComponentProps<typeof HeadingElement>
