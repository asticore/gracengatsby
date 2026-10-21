'use client'

import { createContext } from 'react'

import type { BlockContext } from '@/lib/blockContext'

/** Sample page data for the canvas (site templates "Preview as"); null shows plain placeholders. */
export const PreviewContext = createContext<BlockContext | null>(null)
