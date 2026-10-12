import React from 'react'

import { safeUrl } from '@/lib/mergeTags'

export type ButtonElementProps = {
  text?: string
  url?: string
  variant?: 'primary' | 'plain'
  align?: 'left' | 'center' | 'right'
}

/** The `button` element: a link styled with the site's own .btn classes. */
export const ButtonElement: React.FC<ButtonElementProps> = ({ text, url, variant = 'primary', align = 'left' }) => {
  const href = safeUrl(url) || '#'
  return (
    <div style={{ textAlign: align }}>
      <a className={variant === 'plain' ? 'btn btn--ghost' : 'btn btn--primary'} href={href}>
        {text || 'Button'}
      </a>
    </div>
  )
}
