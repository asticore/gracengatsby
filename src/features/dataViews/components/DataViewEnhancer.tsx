'use client'

import { useEffect } from 'react'

import { enhanceDataViews } from '../enhance'

/** Renders nothing. After the page loads it upgrades the tables and charts already in the markup. */
export function DataViewEnhancer(): null {
  useEffect(() => {
    enhanceDataViews(document)
  }, [])
  return null
}
