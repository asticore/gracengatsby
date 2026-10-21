import React from 'react'

import { sanitizeInlineHtml } from '@/views/visualEditor/inlineFormat'

/** Markers of the rich subset: an allowed tag, or an entity the sanitiser writes (so "Tom &amp; Jerry" round-trips). */
const RICH_MARKER = /<\/?(?:strong|b|em|i|a|br)(?:[\s/>])|&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i

export const hasInlineMarkup = (text: string): boolean => RICH_MARKER.test(text)

/**
 * Renders a text prop that may hold the sanitised inline subset (strong, em, a[href], br). Plain strings render
 * exactly as before (React-escaped text), including ones with a bare '&' or '<'. Server-safe, no hooks.
 */
export const SafeInlineHtml: React.FC<{ text: string; as?: React.ElementType; style?: React.CSSProperties; className?: string }> = ({ text, as, style, className }) => {
  const Tag = (as ?? React.Fragment) as React.ElementType
  const props = as ? { style, className } : {}
  if (!hasInlineMarkup(text)) return <Tag {...props}>{text}</Tag>
  return <Tag {...props} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(text) }} />
}
