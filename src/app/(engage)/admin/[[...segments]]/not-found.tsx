import type { Metadata } from 'next'

import { NotFoundPage, generatePageMetadata } from '@/engine/next/views'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ params, searchParams })

const NotFound = ({ params, searchParams }: Args) => NotFoundPage({ params, searchParams })

export default NotFound
