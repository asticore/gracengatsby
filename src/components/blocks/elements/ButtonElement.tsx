import React from 'react'

import { safeUrl } from '@/lib/mergeTags'
import { sanitizeSlug } from '@/features/themeStyles/sanitize'

export type ButtonElementProps = {
  text?: string
  url?: string
  variant?: 'primary' | 'secondary' | 'plain'
  /** A custom button style id from Theme styles > Buttons. Added on top of `variant` when set. */
  styleName?: string
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center' | 'right'
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
export const ButtonElement: React.FC<ButtonElementProps> = ({ text, url, variant = 'primary', styleName, size, align = 'left' }) => {
  const href = safeUrl(url) || '#'
  return (
    <div style={{ textAlign: align }}>
      <a className={buttonClassName(variant, styleName, size)} href={href}>
        {text || 'Button'}
      </a>
    </div>
  )
}