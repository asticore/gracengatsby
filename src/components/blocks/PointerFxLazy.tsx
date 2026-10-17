'use client'

import dynamic from 'next/dynamic'

/** Client boundary so the pointer script is its own chunk. StyledBlock renders it only when a block sets pointerFx. */
const PointerFxLazy = dynamic(() => import('./PointerFx'), { ssr: false })

export default PointerFxLazy
