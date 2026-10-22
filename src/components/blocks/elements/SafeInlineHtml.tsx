import React from 'react'

import { sanitizeInlineHtml, type Mark } from '@/views/visualEditor/inlineFormat'

/** Markers of the rich subset: an allowed tag, or an entity the sanitiser writes (so "Tom &amp; Jerry" round-trips). */
const RICH_MARKER = /<\/?(?:strong|b|em|i|a|br)(?:[\s/>])|&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i

export const hasInlineMarkup = (text: string): boolean => RICH_MARKER.test(text)

/**
 * Renders a text prop that may hold the sanitised inline subset (strong, em, a[href], br). Plain strings render
 * exactly as before (React-escaped text), including ones with a bare '&' or '<'. Server-safe, no hooks.
 */
export const SafeInlineHtml: React.FC<{ text: string; as?: React.ElementType; style?: React.CSSProperties; className?: string; formats?: readonly Mark[] }> = ({ text, as, style, className, formats }) => {
  const props = as ? { style, className } : {}
  if (!hasInlineMarkup(text)) {
    const Plain = (as ?? React.Fragment) as React.ElementType
    return <Plain {...props}>{text}</Plain>
  }
  // Markup needs an element to hold it (a Fragment cannot take innerHTML), so default to a span.
  const Tag = (as ?? 'span') as React.ElementType
  return <Tag {...(as ? props : {})} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(text, formats) }} />
}
