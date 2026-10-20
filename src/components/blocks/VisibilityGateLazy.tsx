'use client'

import dynamic from 'next/dynamic'

/** Client boundary so the evaluator is its own chunk. StyledBlock renders it only when a block has visibility rules. */
const VisibilityGateLazy = dynamic(() => import('./VisibilityGate'), { ssr: false })

export default VisibilityGateLazy
