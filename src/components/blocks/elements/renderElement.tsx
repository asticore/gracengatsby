import React from 'react'

import { designToCss } from '@/lib/design/css'
import { isDesignError, isDesignV2Raw, upgradeDesign } from '@/lib/design/upgrade'

import { getTemplateSlot } from '@/features/siteTemplates/slot'

import { ButtonElement } from './ButtonElement'
import { ELEMENT_COMPONENTS } from './elementComponents'
import { HeadingElement } from './HeadingElement'

/**
 * Sub-dispatch for the `element` block, keyed by `props.elementType` rather
 * than `blockType` - this is the free part of the design described in
 * src/blocks/Element.ts: adding a new element type here costs no schema, only
 * a case. Shared by the live site (BlockRenderer.tsx) and the editor canvas
 * (CanvasBlockPreview.tsx).
 *
 * With a v2 design and a scope id, the element is wrapped in a div with
 * data-eid and a scoped <style> (src/lib/design/css.ts). v1 designs and calls
 * without a design return the element unchanged; v1 keeps its own wrapper.
 */
export const renderElement = (elementType: string, props: Record<string, unknown>, design?: unknown, scopeId?: string): React.ReactNode =>
  withElementDesign(renderElementBody(elementType, props), design, scopeId)

/** Wraps rendered element content in its v2 design. Also used by the server-only site elements (Wave38Elements.tsx). */
export const withElementDesign = (content: React.ReactNode, design?: unknown, scopeId?: string): React.ReactNode => {
  if (design === undefined || scopeId === undefined || !isDesignV2Raw(design)) return content
  const upgraded = upgradeDesign(design)
  if (isDesignError(upgraded)) return content
  const css = designToCss(upgraded, scopeId)
  if (!css || content === null) return content
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div data-eid={scopeId}>{content}</div>
    </>
  )
}

const renderElementBody = (elementType: string, props: Record<string, unknown>): React.ReactNode => {
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
