import { RootLayout } from '@/engine/next/layouts'
import { headers } from 'next/headers'
import React from 'react'

// Stage 12 (full custom rebuild): the admin no longer imports
// `@payloadcms/next/css` at all - custom.css + tailwind.css (imported below)
// are now this admin's entire visual system, built from scratch. Inter is
// the admin's one single font (self-hosted via @fontsource, same as the
// frontend's own body text - see (frontend)/layout.tsx for the identical
// pattern) - before this, the admin loaded no custom font at all and fell
// back to the raw OS system-font stack.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './tailwind.css'

export const generateViewport = async () => {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') ?? ''
  const isIPhone = /iPhone/i.test(userAgent)

  return {
    initialScale: 1,
    width: 'device-width',
    ...(isIPhone ? { maximumScale: 1 } : {}),
  }
}

type Args = {
  children: React.ReactNode
}

const Layout = ({ children }: Args) => <RootLayout>{children}</RootLayout>

export default Layout
