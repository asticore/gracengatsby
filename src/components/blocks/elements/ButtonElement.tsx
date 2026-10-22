import React from 'react'

import { sanitizeSlug } from '@/features/themeStyles/sanitize'

import { MARKS_NO_LINK } from '@/views/visualEditor/inlineFormat'

import { SafeInlineHtml } from './SafeInlineHtml'
import { flag, linkAttrs, linkHref } from './elementUtil'

export type ButtonElementProps = {
  text?: string
  url?: string
  variant?: 'primary' | 'secondary' | 'plain'
  /** A custom button style id from Theming > Buttons. Added on top of `variant` when set. */
  styleName?: string
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center' | 'right'
  /** Open in a new tab (rel noopener noreferrer). */
  newTab?: boolean
  /** Adds rel="nofollow". */
  nofollow?: boolean
}

/** The class list for a button element. Exported so the output can be tested without rendering. */
export function buttonClassName(variant: ButtonElementProps['variant'], styleName?: string, size?: ButtonElementProps['size']): string {
  const slug = sanitizeSlug(styleName)
  const base = variant === 'plain' ? 'btn--ghost' : variant === 'secondary' ? 'btn--secondary' : 'btn--primary'
  // The base class stays so a custom style that was deleted or mistyped still renders as a normal button.
  const style = slug && `btn--${slug}` !== base ? `${base} btn--${slug}` : base
  return ['btn', style, size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : ''].filter(Boolean).join(' ')
}

/** The `button` element: a link styled with the site's own .btn classes. */
export const ButtonElement: React.FC<ButtonElementProps> = ({ text, url, variant = 'primary', styleName, size, align = 'left', newTab, nofollow }) => {
  const href = linkHref(url) || '#'
  const attrs = linkAttrs({ newTab: flag(newTab), nofollow: flag(nofollow) })
  return (
    <div style={{ textAlign: align }}>
      <a className={buttonClassName(variant, styleName, size)} href={href} {...attrs}>
        <SafeInlineHtml text={text || 'Button'} formats={MARKS_NO_LINK} />
      </a>
    </div>
  )
}
