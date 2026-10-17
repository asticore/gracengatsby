'use client'

import dynamic from 'next/dynamic'

/** Client boundary so the particles script is a separate chunk that only loads when a block uses it. */
const ParticlesLazy = dynamic(() => import('./ParticlesBackground'), { ssr: false })

export default ParticlesLazy
