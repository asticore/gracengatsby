/* THIS FILE WAS GENERATED AUTOMATICALLY BY THE CMS ENGINE. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import { headers } from 'next/headers'
import React from 'react'

import { importMap } from './admin/importMap.js'
import './custom.css'

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

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
