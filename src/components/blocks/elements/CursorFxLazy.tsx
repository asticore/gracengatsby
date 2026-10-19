'use client'

import dynamic from 'next/dynamic'

/** Client boundary so the cursor script is its own chunk. Wave44Elements renders it only when a cursor is chosen. */
const CursorFxLazy = dynamic(() => import('./CursorFx'), { ssr: false })

export default CursorFxLazy
