import React from 'react'

import { getTemplateSlot } from '@/features/siteTemplates/slot'

import { ButtonElement } from './ButtonElement'
import { ELEMENT_COMPONENTS } from './elementComponents'
import { HeadingElement } from './HeadingElement'

/**
 * Sub-dispatch for the `element` block, keyed by `props.elementType` rather
 * than `blockType` - this is the free part of the design described in
 * src/blocks/Element.ts: adding a new element type here costs no schema, only
 * a case. Shared by the live site (BlockRenderer.tsx) and the editor canvas
 * (CanvasBlockPreview.tsx). The element's Design wrapper is the block's
 * StyledBlock (asBlockStyle), not this function.
 */
export const renderElement = (elementType: string, props: Record<string, unknown>): React.ReactNode => {
  switch (elementType) {
    case 'heading':
      return (
        <HeadingElement
          {...(props as Partial<HeadingElementProps>)}
          text={props.text as string}
          tag={props.tag as HeadingElementProps['tag']}
          align={props.align as HeadingElementProps['align']}
          link={props.link as string}
        />
      )
    case 'button':
      return (
        <ButtonElement
          text={props.text as string}
          url={props.url as string}
          variant={props.variant as 'primary' | 'secondary' | 'plain'}
          styleName={props.styleName as string}
          size={props.size as 'sm' | 'md' | 'lg'}
          align={props.align as 'left' | 'center' | 'right'}
        />
      )
    case 'content-slot':
      // The page's own content, set per request by renderWithTemplate. Empty outside a template (the
      // visual editor draws its own placeholder for it, see CanvasBlockPreview).
      return getTemplateSlot() ?? null
    default: {
      const Component = ELEMENT_COMPONENTS[elementType]
      return Component ? <Component {...props} /> : null
    }
  }
}

type HeadingElementProps = React.ComponentProps<typeof HeadingElement>
