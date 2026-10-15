import type React from 'react'
import { cache } from 'react'

/**
 * The place a template's "Template content" element draws the page's own content. One store per request
 * (React cache), so two visitors never share a node.
 */
const slotStore = cache(() => ({ node: null as React.ReactNode }))

export const setTemplateSlot = (node: React.ReactNode): void => {
  slotStore().node = node
}

export const getTemplateSlot = (): React.ReactNode => slotStore().node