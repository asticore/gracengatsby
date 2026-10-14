'use client'

import React, { useMemo } from 'react'

export type PreviewDevice = 'desktop' | 'mobile'
export type PreviewTheme = 'light' | 'dark'

type Props = {
  html: string
  device: PreviewDevice
  theme: PreviewTheme
  onDevice: (device: PreviewDevice) => void
  onTheme: (theme: PreviewTheme) => void
}

/**
 * Adds a dark page behind the email to show roughly how it looks in dark mode.
 * Email apps decide their own dark colours, so this is only an approximation.
 */
const withTheme = (html: string, theme: PreviewTheme): string =>
  theme === 'dark' ? html.replace('</head>', '<style>body{background:#1d1d1f !important;}</style></head>') : html

/** The live preview of one email, in a sandboxed frame so nothing in it can run. */
export function PreviewPane({ html, device, theme, onDevice, onTheme }: Props) {
  const srcDoc = useMemo(() => withTheme(html, theme), [html, theme])
  return (
    <div className="ed-preview">
      <div className="ed-preview__toolbar" role="group" aria-label="Preview options">
        <div className="ed-segment">
          <button type="button" className="ed-button ed-button--quiet" aria-pressed={device === 'desktop'} onClick={() => onDevice('desktop')}>
            Computer
          </button>
          <button type="button" className="ed-button ed-button--quiet" aria-pressed={device === 'mobile'} onClick={() => onDevice('mobile')}>
            Phone
          </button>
        </div>
        <div className="ed-segment">
          <button type="button" className="ed-button ed-button--quiet" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>
            Light
          </button>
          <button type="button" className="ed-button ed-button--quiet" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
            Dark
          </button>
        </div>
      </div>
      <div className={`ed-preview__frame ed-preview__frame--${device}`}>
        <iframe title="Email preview" sandbox="" srcDoc={srcDoc} className="ed-preview__iframe" />
      </div>
    </div>
  )
}
